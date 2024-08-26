/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./nativeEditContext';
import { AbstractEditContextHandler, ariaLabelForScreenReaderContent, ISimpleModel, newlinecount, PagedScreenReaderStrategy } from 'vs/editor/browser/controller/editContext/editContextUtils';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ViewController } from 'vs/editor/browser/view/viewController';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { NativeEditContext } from 'vs/editor/browser/controller/editContext/native/nativeEditContext';
import { RestrictedRenderingContext, RenderingContext, HorizontalPosition } from 'vs/editor/browser/view/renderingContext';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from 'vs/base/browser/ui/mouseCursor/mouseCursor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import * as dom from 'vs/base/browser/dom';
import { applyFontInfo } from 'vs/editor/browser/config/domFontInfo';
import { FontInfo } from 'vs/editor/common/config/fontInfo';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { EndOfLinePreference } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';

interface ScreenReaderContentInfo {
	content: string;
	selectionOffsetStart: number;
	selectionOffsetEnd: number;
}

export class NativeEditContextHandler extends AbstractEditContextHandler {

	static NATIVE_EDIT_CONTEXT_CLASS_NAME = 'native-edit-context';

	// Dom element which holds screen reader content and handles key presses
	private readonly _domElement: FastDomNode<HTMLDivElement>;

	// Field indicating whether dom element is focused
	private _hasFocus: boolean = false;

	// Class which handles the native edit context API
	private readonly _nativeEditContext: NativeEditContext;

	// Configuration values
	private _contentLeft!: number;
	private _contentWidth!: number;
	private _lineHeight!: number;
	private _fontInfo!: FontInfo;
	private _accessibilitySupport!: AccessibilitySupport;
	private _accessibilityPageSize!: number;

	// Fields used for rendering
	private _scrollTop: number = 0;
	private _primarySelection: Selection = new Selection(1, 1, 1, 1);
	private _primaryCursorVisibleRange: HorizontalPosition | null = null;
	private _screenReaderContentInfo: ScreenReaderContentInfo | null = null;

	constructor(
		context: ViewContext,
		viewController: ViewController,
		@IClipboardService clipboardService: IClipboardService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(context);

		this._domElement = new FastDomNode(document.createElement('div'));
		this._domElement.setClassName(`${NativeEditContextHandler.NATIVE_EDIT_CONTEXT_CLASS_NAME} ${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`);

		this._nativeEditContext = new NativeEditContext(this._domElement, context, viewController, clipboardService);

		this._register(dom.addDisposableListener(this._domElement.domNode, 'focus', () => this._setHasFocus(true)));
		this._register(dom.addDisposableListener(this._domElement.domNode, 'blur', () => this._setHasFocus(false)));

		this._updateConfigurationSettings();
		this._updateDomAttributes();
	}

	appendTo(overflowGuardContainer: FastDomNode<HTMLElement>): void {
		overflowGuardContainer.appendChild(this._domElement);
		this._nativeEditContext.setParent(overflowGuardContainer.domNode);
	}

	public prepareRender(ctx: RenderingContext): void {
		this._primaryCursorVisibleRange = ctx.visibleRangeForPosition(this._primarySelection.getPosition());
		this._nativeEditContext.setRenderingContext(ctx);
	}

	public render(ctx: RestrictedRenderingContext): void {
		this.writeScreenReaderContent();
		this._nativeEditContext.onRender();
		this._render();
	}

	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._primarySelection = e.selections[0] ?? new Selection(1, 1, 1, 1);
		this.writeScreenReaderContent();
		this._nativeEditContext.onCursorStateChanged(e);
		this._render();
		return true;
	}

	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this._scrollTop = e.scrollTop;
		this._nativeEditContext.onScrollChanged(e);
		this._render();
		return true;
	}

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this._updateConfigurationSettings();
		this._updateDomAttributes();
		if (e.hasChanged(EditorOption.accessibilitySupport)) {
			this.writeScreenReaderContent();
		}
		return true;
	}

	private _updateConfigurationSettings(): void {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._contentLeft = layoutInfo.contentLeft;
		this._contentWidth = layoutInfo.contentWidth;
		this._fontInfo = options.get(EditorOption.fontInfo);
		this._lineHeight = options.get(EditorOption.lineHeight);
		this._accessibilitySupport = options.get(EditorOption.accessibilitySupport);
		this._accessibilityPageSize = options.get(EditorOption.accessibilityPageSize);
	}

	private _updateDomAttributes(): void {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		this._domElement.domNode.setAttribute('wrap', layoutInfo.wrappingColumn !== -1 ? 'on' : 'off');
		this._domElement.domNode.setAttribute('tabindex', String(options.get(EditorOption.tabIndex)));
		this._domElement.domNode.setAttribute('aria-label', ariaLabelForScreenReaderContent(options, this._keybindingService));
		const tabSize = this._context.viewModel.model.getOptions().tabSize;
		const spaceWidth = options.get(EditorOption.fontInfo).spaceWidth;
		this._domElement.domNode.style.tabSize = `${tabSize * spaceWidth}px`;
	}

	public isFocused(): boolean {
		return this._hasFocus;
	}

	public focusScreenReaderContent(): void {
		this._setHasFocus(true);
		this.refreshFocusState();
	}

	public refreshFocusState(): void {
		const shadowRoot = dom.getShadowRoot(this._domElement.domNode);
		let hasFocus: boolean;
		if (shadowRoot) {
			hasFocus = shadowRoot.activeElement === this._domElement.domNode;
		} else if (this._domElement.domNode.isConnected) {
			hasFocus = dom.getActiveElement() === this._domElement.domNode;
		} else {
			hasFocus = false;
		}
		this._setHasFocus(hasFocus);
	}

	private _setHasFocus(newHasFocus: boolean): void {
		if (this._hasFocus === newHasFocus) {
			// no change
			return;
		}
		this._hasFocus = newHasFocus;
		if (this._hasFocus) {
			this._domElement.domNode.focus();
		}
		if (this._hasFocus) {
			this._context.viewModel.setHasFocus(true);
		} else {
			this._context.viewModel.setHasFocus(false);
		}
	}

	public setAriaOptions(): void { }

	public writeScreenReaderContent(): void {
		const screenReaderContentInfo = this._getScreenReaderContentInfo();
		if (!screenReaderContentInfo) {
			return;
		}
		if (this._domElement.domNode.textContent !== screenReaderContentInfo.content) {
			this._domElement.domNode.textContent = screenReaderContentInfo.content;
		}
		this._setSelectionOfScreenReaderContent(screenReaderContentInfo.selectionOffsetStart, screenReaderContentInfo.selectionOffsetEnd);
		this._screenReaderContentInfo = screenReaderContentInfo;
	}

	private _getScreenReaderContentInfo(): ScreenReaderContentInfo | undefined {
		if (this._accessibilitySupport === AccessibilitySupport.Disabled) {
			return;
		}
		const simpleModel: ISimpleModel = {
			getLineCount: (): number => {
				return this._context.viewModel.getLineCount();
			},
			getLineMaxColumn: (lineNumber: number): number => {
				return this._context.viewModel.getLineMaxColumn(lineNumber);
			},
			getValueInRange: (range: Range, eol: EndOfLinePreference): string => {
				return this._context.viewModel.getValueInRange(range, eol);
			},
			getValueLengthInRange: (range: Range, eol: EndOfLinePreference): number => {
				return this._context.viewModel.getValueLengthInRange(range, eol);
			},
			modifyPosition: (position: Position, offset: number): Position => {
				return this._context.viewModel.modifyPosition(position, offset);
			}
		};
		const screenReaderContent = PagedScreenReaderStrategy.fromEditorSelection(simpleModel, this._primarySelection, this._accessibilityPageSize, this._accessibilitySupport === AccessibilitySupport.Unknown);
		return {
			content: screenReaderContent.value,
			selectionOffsetStart: screenReaderContent.selectionStart,
			selectionOffsetEnd: screenReaderContent.selectionEnd
		};
	}

	private _setSelectionOfScreenReaderContent(selectionOffsetStart: number, selectionOffsetEnd: number): void {
		const activeDocument = dom.getActiveWindow().document;
		const activeDocumentSelection = activeDocument.getSelection();
		if (!activeDocumentSelection) {
			return;
		}
		const textContent = this._domElement.domNode.firstChild;
		if (!textContent) {
			return;
		}
		const range = new globalThis.Range();
		range.setStart(textContent, selectionOffsetStart);
		range.setEnd(textContent, selectionOffsetEnd);
		activeDocumentSelection.removeAllRanges();
		activeDocumentSelection.addRange(range);
	}

	private _render(): void {
		if (!this._primaryCursorVisibleRange || !this._screenReaderContentInfo) {
			return;
		}
		// For correct alignment of the screen reader content, we need to apply the correct font
		applyFontInfo(this._domElement, this._fontInfo);

		const top = this._context.viewLayout.getVerticalOffsetForLineNumber(this._primarySelection.positionLineNumber) - this._scrollTop;
		this._domElement.setTop(top);
		this._domElement.setLeft(this._contentLeft);
		this._domElement.setWidth(this._contentWidth);
		this._domElement.setHeight(this._lineHeight);

		// Setting position within the screen reader content
		const textContent = this._screenReaderContentInfo.content;
		const textContentBeforeSelection = textContent.substring(0, this._screenReaderContentInfo.selectionOffsetStart);
		this._domElement.domNode.scrollTop = newlinecount(textContentBeforeSelection) * this._lineHeight;
		this._domElement.domNode.scrollLeft = this._primaryCursorVisibleRange.left;
	}
}
