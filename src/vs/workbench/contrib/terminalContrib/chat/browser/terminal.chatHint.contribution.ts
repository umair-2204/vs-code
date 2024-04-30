/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IDetachedTerminalInstance, ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import type { Terminal as RawXtermTerminal, IDecoration } from '@xterm/xterm';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, ITerminalProcessInfo } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { localize } from 'vs/nls';
import { Event } from 'vs/base/common/event';
import { OS } from 'vs/base/common/platform';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IContentActionHandler, renderFormattedText } from 'vs/base/browser/formattedTextRenderer';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInlineChatService, IInlineChatSessionProvider } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { status } from 'vs/base/browser/ui/aria/aria';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalChatCommandId } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminalInstance';
const $ = dom.$;

class TerminalChatHintContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.chatHint';

	private _hintWidget: HTMLElement | undefined;

	static get(instance: ITerminalInstance | IDetachedTerminalInstance): TerminalChatHintContribution | null {
		return instance.getContribution<TerminalChatHintContribution>(TerminalChatHintContribution.ID);
	}

	private _xterm: IXtermTerminal & { raw: RawXtermTerminal } | undefined;
	private _chatHint: IDecoration | undefined;

	constructor(
		private readonly _instance: ITerminalInstance | IDetachedTerminalInstance,
		processManager: ITerminalProcessManager | ITerminalProcessInfo,
		widgetManager: TerminalWidgetManager,
		@IInlineChatService private readonly _inlineChatService: IInlineChatService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
	}

	xtermOpen(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		if (this._terminalService.instances.length !== 1) {
			// only show for the first terminal
			return;
		}
		this._xterm = xterm;
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		if (capability) {
			this._register(Event.once(capability.promptInputModel.onDidStartInput)(() => this._addChatHint()));
		} else {
			this._register(this._instance.capabilities.onDidAddCapability(e => {
				if (e.capability.type === TerminalCapability.CommandDetection) {
					const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
					this._register(Event.once(capability!.promptInputModel.onDidStartInput)(() => this._addChatHint()));
					if (!capability!.promptInputModel.value) {
						this._addChatHint();
					}
				}
			}));
		}

		this._register(Event.once(this._inlineChatService.onDidChangeProviders)(() => this._addChatHint()));
	}

	private _addChatHint(): void {
		const instance = this._instance instanceof TerminalInstance ? this._instance : undefined;
		if (!instance || !this._xterm || this._hintWidget || instance?.capabilities.get(TerminalCapability.CommandDetection)?.hasInput) {
			return;
		}

		if (!this._chatHint) {
			const marker = this._xterm.raw.registerMarker();
			if (!marker) {
				return;
			}

			if (this._xterm.raw.buffer.active.cursorX === 0) {
				return;
			}
			this._register(marker);
			this._chatHint = this._xterm.raw.registerDecoration({
				marker,
				x: this._xterm.raw.buffer.active.cursorX + 1
			});
		}

		this._register(this._xterm.raw.onKey(() => this._chatHint?.dispose()));
		this._chatHint?.onRender((e) => {
			if (!this._hintWidget && this._xterm?.isFocused && this._terminalService.instances.length === 1) {
				const chatProviders = [...this._inlineChatService.getAllProvider()];
				if (chatProviders?.length) {
					const widget = this._instantiationService.createInstance(TerminalChatHintWidget, instance);
					this._hintWidget = widget.getDomNode(chatProviders);
					if (!this._hintWidget) {
						return;
					}
					e.appendChild(this._hintWidget);
					e.classList.add('terminal-chat-hint');
					e.style.width = (this._xterm!.raw.cols - this._xterm!.raw.buffer.active.cursorX) / this._xterm!.raw.cols * 100 + '%';
				}
			}
		});
	}
}
registerTerminalContribution(TerminalChatHintContribution.ID, TerminalChatHintContribution, false);



class TerminalChatHintWidget extends Disposable {


	private domNode: HTMLElement | undefined;
	private readonly toDispose: DisposableStore = this._register(new DisposableStore());
	private isVisible = false;
	private ariaLabel: string = '';

	constructor(
		private readonly _instance: ITerminalInstance,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService
	) {
		super();
		this.toDispose.add(_instance.onDidFocus(() => {
			if (this._instance.hasFocus && this.isVisible && this.ariaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.EmptyEditorHint)) {
				status(this.ariaLabel);
			}
		}));
	}

	private _getHintInlineChat(providers: IInlineChatSessionProvider[]) {
		const providerName = (providers.length === 1 ? providers[0].label : undefined) ?? this.productService.nameShort;

		let ariaLabel = `Ask ${providerName} something or start typing to dismiss.`;

		const handleClick = () => {
			this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', {
				id: 'inlineChat.hintAction',
				from: 'hint'
			});
			this.commandService.executeCommand(TerminalChatCommandId.Start, { from: 'hint' });
		};

		const hintHandler: IContentActionHandler = {
			disposables: this.toDispose,
			callback: (index, _event) => {
				switch (index) {
					case '0':
						handleClick();
						break;
				}
			}
		};

		const hintElement = $('terminal-chat-hint');
		hintElement.style.display = 'block';

		const keybindingHint = this.keybindingService.lookupKeybinding(TerminalChatCommandId.Start);
		const keybindingHintLabel = keybindingHint?.getLabel();

		if (keybindingHint && keybindingHintLabel) {
			const actionPart = localize('emptyHintText', 'Press {0} to ask {1} to do something. ', keybindingHintLabel, providerName);

			const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
				const hintPart = $('a', undefined, fragment);
				hintPart.style.fontStyle = 'italic';
				hintPart.style.cursor = 'pointer';
				this.toDispose.add(dom.addDisposableListener(hintPart, dom.EventType.CLICK, handleClick));
				return hintPart;
			});

			hintElement.appendChild(before);

			const label = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
			label.set(keybindingHint);
			label.element.style.width = 'min-content';
			label.element.style.display = 'inline';

			label.element.style.cursor = 'pointer';
			this.toDispose.add(dom.addDisposableListener(label.element, dom.EventType.CLICK, handleClick));

			hintElement.appendChild(after);

			const typeToDismiss = localize('emptyHintTextDismiss', 'Start typing to dismiss.');
			const textHint2 = $('span', undefined, typeToDismiss);
			textHint2.style.fontStyle = 'italic';
			hintElement.appendChild(textHint2);

			ariaLabel = actionPart.concat(typeToDismiss);
		} else {
			const hintMsg = localize({
				key: 'inlineChatHint',
				comment: [
					'Preserve double-square brackets and their order',
				]
			}, '[[Ask {0} to do something]] or start typing to dismiss.', providerName);
			const rendered = renderFormattedText(hintMsg, { actionHandler: hintHandler });
			hintElement.appendChild(rendered);
		}

		return { ariaLabel, hintHandler, hintElement };
	}


	getDomNode(providers: IInlineChatSessionProvider[]): HTMLElement {
		if (!this.domNode) {
			this.domNode = $('.terminal-chat-hint');
			this.domNode!.style.width = 'max-content';
			this.domNode!.style.paddingLeft = '4px';

			const { hintElement, ariaLabel } = this._getHintInlineChat(providers);
			this.domNode.append(hintElement);
			this.ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', AccessibilityVerbositySettingId.EmptyEditorHint));

			this.toDispose.add(dom.addDisposableListener(this.domNode, 'click', () => {
				this._instance.focus();
				this.domNode?.remove();
				this.domNode = undefined;
			}));

		}

		return this.domNode;
	}


	override dispose(): void {
		this.domNode?.remove();
		super.dispose();
	}
}

