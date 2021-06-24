/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { timeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { FindReplaceState } from 'vs/editor/contrib/find/findState';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IShellLaunchConfig } from 'vs/platform/terminal/common/terminal';
import { IViewsService } from 'vs/workbench/common/views';
import { ITerminalGroup, ITerminalGroupService, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalConfigHelper } from 'vs/workbench/contrib/terminal/browser/terminalConfigHelper';
import { TerminalGroup } from 'vs/workbench/contrib/terminal/browser/terminalGroup';
import { TerminalViewPane } from 'vs/workbench/contrib/terminal/browser/terminalView';
import { KEYBINDING_CONTEXT_TERMINAL_GROUP_COUNT, TerminalLocation, TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';

export class TerminalGroupService extends Disposable implements ITerminalGroupService {
	declare _serviceBrand: undefined;

	groups: ITerminalGroup[] = [];
	activeGroupIndex: number = -1;
	get instances(): ITerminalInstance[] {
		return this.groups.reduce((p, c) => p.concat(c.terminalInstances), [] as ITerminalInstance[]);
	}
	activeInstanceIndex: number = -1;

	private _terminalGroupCountContextKey: IContextKey<number>;
	private _container: HTMLElement | undefined;

	private _findState: FindReplaceState;

	private _configHelper: TerminalConfigHelper;

	private readonly _onDidChangeActiveGroup = new Emitter<ITerminalGroup | undefined>();
	get onDidChangeActiveGroup(): Event<ITerminalGroup | undefined> { return this._onDidChangeActiveGroup.event; }
	private readonly _onDidDisposeGroup = new Emitter<ITerminalGroup>();
	get onDidDisposeGroup(): Event<ITerminalGroup> { return this._onDidDisposeGroup.event; }
	private readonly _onDidChangeGroups = new Emitter<void>();
	get onDidChangeGroups(): Event<void> { return this._onDidChangeGroups.event; }

	private readonly _onDidDisposeInstance = new Emitter<ITerminalInstance>();
	get onDidDisposeInstance(): Event<ITerminalInstance> { return this._onDidDisposeInstance.event; }
	private readonly _onDidChangeActiveInstance = new Emitter<ITerminalInstance | undefined>();
	get onDidChangeActiveInstance(): Event<ITerminalInstance | undefined> { return this._onDidChangeActiveInstance.event; }
	private readonly _onDidChangeInstances = new Emitter<void>();
	get onDidChangeInstances(): Event<void> { return this._onDidChangeInstances.event; }

	private readonly _onPanelOrientationChanged = new Emitter<Orientation>();
	get onPanelOrientationChanged(): Event<Orientation> { return this._onPanelOrientationChanged.event; }

	constructor(
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IViewsService private readonly _viewsService: IViewsService
	) {
		super();

		this.onDidDisposeGroup(group => this._removeGroup(group));

		this._terminalGroupCountContextKey = KEYBINDING_CONTEXT_TERMINAL_GROUP_COUNT.bindTo(this._contextKeyService);
		this.onDidChangeGroups(() => this._terminalGroupCountContextKey.set(this.groups.length));

		this._findState = new FindReplaceState();

		this._configHelper = _instantiationService.createInstance(TerminalConfigHelper);
	}

	get activeGroup(): ITerminalGroup | undefined {
		if (this.activeGroupIndex < 0 || this.activeGroupIndex >= this.groups.length) {
			return undefined;
		}
		return this.groups[this.activeGroupIndex];
	}
	set activeGroup(value: ITerminalGroup | undefined) {
		if (value === undefined) {
			this.activeGroupIndex = -1;
			return;
		}
		this.activeGroupIndex = this.groups.findIndex(e => e === value);
	}

	get activeInstance(): ITerminalInstance | undefined {
		return this.activeGroup?.activeInstance;
	}

	setActiveInstance(instance: ITerminalInstance) {
		this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
	}

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = this.instances.findIndex(e => e.instanceId === terminalId);
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	setContainer(container: HTMLElement) {
		this._container = container;
		this.groups.forEach(group => group.attachToElement(container));
	}

	createGroup(slcOrInstance?: IShellLaunchConfig | ITerminalInstance): ITerminalGroup {
		const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
		// TODO: Move panel orientation change into this file so it's not fired many times
		group.onPanelOrientationChanged((orientation) => this._onPanelOrientationChanged.fire(orientation));
		this.groups.push(group);
		group.addDisposable(group.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance));
		group.addDisposable(group.onDidChangeActiveInstance(this._onDidChangeActiveInstance.fire, this._onDidChangeActiveInstance));
		group.addDisposable(group.onInstancesChanged(this._onDidChangeInstances.fire, this._onDidChangeInstances));
		group.addDisposable(group.onDisposed(this._onDidDisposeGroup.fire, this._onDidDisposeGroup));
		if (group.terminalInstances.length > 0) {
			this._onDidChangeInstances.fire();
		}
		this._onDidChangeGroups.fire();
		return group;
	}

	async showPanel(focus?: boolean): Promise<void> {
		if (this._configHelper.config.defaultLocation !== TerminalLocation.Editor) {
			const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID)
				?? await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
			pane?.setExpanded(true);
		}

		if (focus) {
			// Do the focus call asynchronously as going through the
			// command palette will force editor focus
			await timeout(0);
			const instance = this.activeInstance;
			if (instance) {
				await instance.focusWhenReady(true);
			}
		}
	}

	findNext(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		if (pane?.terminalTabbedView) {
			pane.terminalTabbedView.showFindWidget();
			pane.terminalTabbedView.getFindWidget().find(false);
		}
	}

	findPrevious(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		if (pane?.terminalTabbedView) {
			pane.terminalTabbedView.showFindWidget();
			pane.terminalTabbedView.getFindWidget().find(true);
		}
	}

	getFindState(): FindReplaceState {
		return this._findState;
	}

	async focusFindWidget(): Promise<void> {
		await this.showPanel(false);
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.focusFindWidget();
	}

	hideFindWidget(): void {
		const pane = this._viewsService.getActiveViewWithId<TerminalViewPane>(TERMINAL_VIEW_ID);
		pane?.terminalTabbedView?.hideFindWidget();
	}

	private _removeGroup(group: ITerminalGroup) {
		// Get the index of the group and remove it from the list
		const activeGroup = this.activeGroup;
		const wasActiveGroup = group === activeGroup;
		const index = this.groups.indexOf(group);
		if (index !== -1) {
			this.groups.splice(index, 1);
			this._onDidChangeGroups.fire();
		}

		// Adjust focus if the group was active
		if (wasActiveGroup && this.groups.length > 0) {
			const newIndex = index < this.groups.length ? index : this.groups.length - 1;
			this.setActiveGroupByIndex(newIndex);
			this.activeInstance?.focus(true);
		} else if (this.activeGroupIndex >= this.groups.length) {
			const newIndex = this.groups.length - 1;
			this.setActiveGroupByIndex(newIndex);
		}

		this._onDidChangeInstances.fire();
		if (this.groups.length === 0) {
			this._onDidChangeActiveInstance.fire(undefined);
		}

		this._onDidChangeGroups.fire();
		if (wasActiveGroup) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
		}
	}

	setActiveGroupByIndex(index: number) {
		if (index >= this.groups.length) {
			return;
		}
		const oldActiveGroup = this.activeGroup;
		this.activeGroupIndex = index;
		if (oldActiveGroup !== this.activeGroup) {
			this.groups.forEach((g, i) => g.setVisible(i === this.activeGroupIndex));
			this._onDidChangeActiveGroup.fire(this.activeGroup);
			this._onDidChangeActiveInstance.fire(this.activeInstance);
		}
	}

	private _getInstanceLocation(index: number): IInstanceLocation | undefined {
		let currentGroupIndex = 0;
		while (index >= 0 && currentGroupIndex < this.groups.length) {
			const group = this.groups[currentGroupIndex];
			const count = group.terminalInstances.length;
			if (index < count) {
				return {
					group,
					groupIndex: currentGroupIndex,
					instance: group.terminalInstances[index],
					instanceIndex: index
				};
			}
			index -= count;
			currentGroupIndex++;
		}
		return undefined;
	}

	setActiveInstanceByIndex(index: number) {
		const activeInstance = this.activeInstance;
		const instanceLocation = this._getInstanceLocation(index);
		const newActiveInstance = instanceLocation?.group.terminalInstances[instanceLocation.instanceIndex];
		if (!instanceLocation || activeInstance === newActiveInstance) {
			return;
		}

		this.activeInstanceIndex = instanceLocation.instanceIndex;
		this.activeGroupIndex = instanceLocation.groupIndex;

		if (this.activeGroupIndex !== instanceLocation.groupIndex) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
		}
		this.groups.forEach((g, i) => g.setVisible(i === instanceLocation.groupIndex));

		instanceLocation.group.setActiveInstanceByIndex(this.activeInstanceIndex);
	}

	setActiveGroupToNext() {
		if (this.groups.length <= 1) {
			return;
		}
		let newIndex = this.activeGroupIndex + 1;
		if (newIndex >= this.groups.length) {
			newIndex = 0;
		}
		this.setActiveGroupByIndex(newIndex);
	}

	setActiveGroupToPrevious() {
		if (this.groups.length <= 1) {
			return;
		}
		let newIndex = this.activeGroupIndex - 1;
		if (newIndex < 0) {
			newIndex = this.groups.length - 1;
		}
		this.setActiveGroupByIndex(newIndex);
	}

	moveGroup(source: ITerminalInstance, target: ITerminalInstance) {
		const sourceGroup = this.getGroupForInstance(source);
		const targetGroup = this.getGroupForInstance(target);
		if (!sourceGroup || !targetGroup) {
			return;
		}
		const sourceGroupIndex = this.groups.indexOf(sourceGroup);
		const targetGroupIndex = this.groups.indexOf(targetGroup);
		this.groups.splice(sourceGroupIndex, 1);
		this.groups.splice(targetGroupIndex, 0, sourceGroup);
		this._onDidChangeInstances.fire();
	}

	moveInstance(source: ITerminalInstance, target: ITerminalInstance, side: 'before' | 'after') {
		const sourceGroup = this.getGroupForInstance(source);
		const targetGroup = this.getGroupForInstance(target);
		if (!sourceGroup || !targetGroup) {
			return;
		}

		// Move from the source group to the target group
		if (sourceGroup !== targetGroup) {
			// Move groups
			sourceGroup.removeInstance(source);
			targetGroup.addInstance(source);
		}

		// Rearrange within the target group
		const index = targetGroup.terminalInstances.indexOf(target) + (side === 'after' ? 1 : 0);
		targetGroup.moveInstance(source, index);
	}

	unsplitInstance(instance: ITerminalInstance) {
		const oldGroup = this.getGroupForInstance(instance);
		if (!oldGroup || oldGroup.terminalInstances.length < 2) {
			return;
		}

		oldGroup.removeInstance(instance);
		this.createGroup(instance);
	}

	joinInstances(instances: ITerminalInstance[]) {
		// Find the group of the first instance that is the only instance in the group, if one exists
		let candidateInstance: ITerminalInstance | undefined = undefined;
		let candidateGroup: ITerminalGroup | undefined = undefined;
		for (const instance of instances) {
			const group = this.getGroupForInstance(instance);
			if (group?.terminalInstances.length === 1) {
				candidateInstance = instance;
				candidateGroup = group;
				break;
			}
		}

		// Create a new group if needed
		if (!candidateGroup) {
			candidateGroup = this.createGroup();
		}

		const wasActiveGroup = this.activeGroup === candidateGroup;

		// Unsplit all other instances and add them to the new group
		for (const instance of instances) {
			if (instance === candidateInstance) {
				continue;
			}

			const oldGroup = this.getGroupForInstance(instance);
			if (!oldGroup) {
				// Something went wrong, don't join this one
				continue;
			}
			oldGroup.removeInstance(instance);
			candidateGroup.addInstance(instance);
		}

		// Set the active terminal
		this.setActiveInstance(instances[0]);

		// Fire events
		this._onDidChangeInstances.fire();
		if (!wasActiveGroup) {
			this._onDidChangeActiveGroup.fire(this.activeGroup);
		}
	}

	instanceIsSplit(instance: ITerminalInstance): boolean {
		const group = this.getGroupForInstance(instance);
		if (!group) {
			return false;
		}
		return group.terminalInstances.length > 1;
	}

	getGroupForInstance(instance: ITerminalInstance): ITerminalGroup | undefined {
		return this.groups.find(group => group.terminalInstances.indexOf(instance) !== -1);
	}

	getGroupLabels(): string[] {
		return this.groups.filter(group => group.terminalInstances.length > 0).map((group, index) => {
			return `${index + 1}: ${group.title ? group.title : ''}`;
		});
	}
}

interface IInstanceLocation {
	group: ITerminalGroup,
	groupIndex: number,
	instance: ITerminalInstance,
	instanceIndex: number
}
