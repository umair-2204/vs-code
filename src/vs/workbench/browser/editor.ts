/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { EditorResourceAccessor, IEditorInput, EditorExtensions, SideBySideEditor, IEditorDescriptor as ICommonEditorDescriptor } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IConstructorSignature0, IInstantiationService, BrandedService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { insert } from 'vs/base/common/arrays';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Promises } from 'vs/base/common/async';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUriIdentityService } from 'vs/workbench/services/uriIdentity/common/uriIdentity';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { URI } from 'vs/workbench/workbench.web.api';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

//#region Editor Pane Registry

export interface IEditorPaneDescriptor extends ICommonEditorDescriptor<EditorPane> { }

export interface IEditorPaneRegistry {

	/**
	 * Registers an editor pane to the platform for the given editor type. The second parameter also supports an
	 * array of input classes to be passed in. If the more than one editor is registered for the same editor
	 * input, the input itself will be asked which editor it prefers if this method is provided. Otherwise
	 * the first editor in the list will be returned.
	 *
	 * @param editorDescriptors A set of constructor functions that return an instance of `EditorInput` for which the
	 * registered editor should be used for.
	 */
	registerEditorPane(editorPaneDescriptor: IEditorPaneDescriptor, editorDescriptors: readonly SyncDescriptor<EditorInput>[]): IDisposable;

	/**
	 * Returns the editor pane descriptor for the given editor or `undefined` if none.
	 */
	getEditorPane(editor: EditorInput): IEditorPaneDescriptor | undefined;
}

/**
 * A lightweight descriptor of an editor pane. The descriptor is deferred so that heavy editor
 * panes can load lazily in the workbench.
 */
export class EditorPaneDescriptor implements IEditorPaneDescriptor {

	static create<Services extends BrandedService[]>(
		ctor: { new(...services: Services): EditorPane },
		typeId: string,
		name: string
	): EditorPaneDescriptor {
		return new EditorPaneDescriptor(ctor as IConstructorSignature0<EditorPane>, typeId, name);
	}

	private constructor(
		private readonly ctor: IConstructorSignature0<EditorPane>,
		readonly typeId: string,
		readonly name: string
	) { }

	instantiate(instantiationService: IInstantiationService): EditorPane {
		return instantiationService.createInstance(this.ctor);
	}

	describes(editorPane: EditorPane): boolean {
		return editorPane.getId() === this.typeId;
	}
}

export class EditorPaneRegistry implements IEditorPaneRegistry {

	private readonly editorPanes: EditorPaneDescriptor[] = [];
	private readonly mapEditorPanesToEditors = new Map<EditorPaneDescriptor, readonly SyncDescriptor<EditorInput>[]>();

	registerEditorPane(editorPaneDescriptor: EditorPaneDescriptor, editorDescriptors: readonly SyncDescriptor<EditorInput>[]): IDisposable {
		this.mapEditorPanesToEditors.set(editorPaneDescriptor, editorDescriptors);

		const remove = insert(this.editorPanes, editorPaneDescriptor);

		return toDisposable(() => {
			this.mapEditorPanesToEditors.delete(editorPaneDescriptor);
			remove();
		});
	}

	getEditorPane(editor: EditorInput): EditorPaneDescriptor | undefined {
		const descriptors = this.findEditorPaneDescriptors(editor);

		if (descriptors.length === 0) {
			return undefined;
		}

		if (descriptors.length === 1) {
			return descriptors[0];
		}

		return editor.prefersEditorPane(descriptors);
	}

	private findEditorPaneDescriptors(editor: EditorInput, byInstanceOf?: boolean): EditorPaneDescriptor[] {
		const matchingEditorPaneDescriptors: EditorPaneDescriptor[] = [];

		for (const editorPane of this.editorPanes) {
			const editorDescriptors = this.mapEditorPanesToEditors.get(editorPane) || [];
			for (const editorDescriptor of editorDescriptors) {
				const editorClass = editorDescriptor.ctor;

				// Direct check on constructor type (ignores prototype chain)
				if (!byInstanceOf && editor.constructor === editorClass) {
					matchingEditorPaneDescriptors.push(editorPane);
					break;
				}

				// Normal instanceof check
				else if (byInstanceOf && editor instanceof editorClass) {
					matchingEditorPaneDescriptors.push(editorPane);
					break;
				}
			}
		}

		// If no descriptors found, continue search using instanceof and prototype chain
		if (!byInstanceOf && matchingEditorPaneDescriptors.length === 0) {
			return this.findEditorPaneDescriptors(editor, true);
		}

		return matchingEditorPaneDescriptors;
	}

	//#region Used for tests only

	getEditorPaneByType(typeId: string): EditorPaneDescriptor | undefined {
		return this.editorPanes.find(editor => editor.typeId === typeId);
	}

	getEditorPanes(): readonly EditorPaneDescriptor[] {
		return this.editorPanes.slice(0);
	}

	getEditors(): SyncDescriptor<EditorInput>[] {
		const editorClasses: SyncDescriptor<EditorInput>[] = [];
		for (const editorPane of this.editorPanes) {
			const editorDescriptors = this.mapEditorPanesToEditors.get(editorPane);
			if (editorDescriptors) {
				editorClasses.push(...editorDescriptors.map(editorDescriptor => editorDescriptor.ctor));
			}
		}

		return editorClasses;
	}

	//#endregion
}

Registry.add(EditorExtensions.EditorPane, new EditorPaneRegistry());

//#endregion

//#region Editor Close Tracker

export function whenEditorClosed(accessor: ServicesAccessor, resources: URI[]): Promise<void> {
	const editorService = accessor.get(IEditorService);
	const uriIdentityService = accessor.get(IUriIdentityService);
	const workingCopyService = accessor.get(IWorkingCopyService);

	return new Promise(resolve => {
		let remainingResources = [...resources];

		// Observe any editor closing from this moment on
		const listener = editorService.onDidCloseEditor(async event => {
			const primaryResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.PRIMARY });
			const secondaryResource = EditorResourceAccessor.getOriginalUri(event.editor, { supportSideBySide: SideBySideEditor.SECONDARY });

			// Remove from resources to wait for being closed based on the
			// resources from editors that got closed
			remainingResources = remainingResources.filter(resource => {
				if (uriIdentityService.extUri.isEqual(resource, primaryResource) || uriIdentityService.extUri.isEqual(resource, secondaryResource)) {
					return false; // remove - the closing editor matches this resource
				}

				return true; // keep - not yet closed
			});

			// All resources to wait for being closed are closed
			if (remainingResources.length === 0) {

				// If auto save is configured with the default delay (1s) it is possible
				// to close the editor while the save still continues in the background. As such
				// we have to also check if the editors to track for are dirty and if so wait
				// for them to get saved.
				const dirtyResources = resources.filter(resource => workingCopyService.isDirty(resource));
				if (dirtyResources.length > 0) {
					await Promises.settled(dirtyResources.map(async resource => await new Promise<void>(resolve => {
						if (!workingCopyService.isDirty(resource)) {
							return resolve(); // return early if resource is not dirty
						}

						// Otherwise resolve promise when resource is saved
						const listener = workingCopyService.onDidChangeDirty(workingCopy => {
							if (!workingCopy.isDirty() && uriIdentityService.extUri.isEqual(resource, workingCopy.resource)) {
								listener.dispose();

								return resolve();
							}
						});
					})));
				}

				listener.dispose();

				return resolve();
			}
		});
	});
}

//#endregion

//#region ARIA

export function computeEditorAriaLabel(input: IEditorInput, index: number | undefined, group: IEditorGroup | undefined, groupCount: number): string {
	let ariaLabel = input.getAriaLabel();
	if (group && !group.isPinned(input)) {
		ariaLabel = localize('preview', "{0}, preview", ariaLabel);
	}

	if (group?.isSticky(index ?? input)) {
		ariaLabel = localize('pinned', "{0}, pinned", ariaLabel);
	}

	// Apply group information to help identify in
	// which group we are (only if more than one group
	// is actually opened)
	if (group && groupCount > 1) {
		ariaLabel = `${ariaLabel}, ${group.ariaLabel}`;
	}

	return ariaLabel;
}

//#endregion
