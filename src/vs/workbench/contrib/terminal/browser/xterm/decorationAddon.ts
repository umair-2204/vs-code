/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDecoration, ITerminalAddon, Terminal } from 'xterm';
import * as dom from 'vs/base/browser/dom';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { localize } from 'vs/nls';
import { Delayer } from 'vs/base/common/async';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const enum DecorationSelector {
	CommandDecoration = 'terminal-command-decoration',
	Error = 'error',
	NoOutput = 'no-output'
}

const enum DecorationProperties {
	Width = .5
}

export class DecorationAddon extends Disposable implements ITerminalAddon {
	private _decorations: IDecoration[] = [];
	protected _terminal: Terminal | undefined;
	private _hoverDelayer: Delayer<void>;

	private readonly _onDidRequestRunCommand = this._register(new Emitter<string>());
	readonly onDidRequestRunCommand = this._onDidRequestRunCommand.event;

	constructor(
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		capabilities: ITerminalCapabilityStore
	) {
		super();
		capabilities.onDidAddCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				capabilities.get(TerminalCapability.CommandDetection)?.onCommandFinished(c => {
					if (c.command === 'clear') {
						this._terminal?.clear();
						for (const decoration of this._decorations) {
							decoration.dispose();
						}
						return;
					}
					const element = this.registerPromptDecoration(c);
					if (element) {
						this._decorations.push(element);
					}
				});
			}
		});
		this._hoverDelayer = this._register(new Delayer(this._configurationService.getValue('workbench.hover.delay')));
	}

	override dispose(): void {
		for (const decoration of this._decorations) {
			decoration.dispose();
		}
		super.dispose();
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	registerPromptDecoration(command: ITerminalCommand): IDecoration | undefined {
		if (!command.marker) {
			throw new Error(`cannot add decoration for command: ${command}, and terminal: ${this._terminal}`);
		} else if (!this._terminal || command.command.trim().length === 0) {
			return undefined;
		}

		const decoration = this._terminal.registerDecoration({ marker: command.marker, width: DecorationProperties.Width });
		const target = decoration?.element;

		if (!target) {
			throw new Error('Cannot register decoration for a marker that has already been disposed of');
		}

		this._createContextMenu(target, command);
		this._createHover(target, command);

		target.classList.add(DecorationSelector.CommandDecoration);
		if (command.exitCode) {
			target.classList.add(DecorationSelector.Error);
		}

		return decoration;
	}

	private _createContextMenu(target: HTMLElement, command: ITerminalCommand) {
		this._register(dom.addDisposableListener(target, dom.EventType.CLICK, async () => {
			const actions = await this._getCommandActions(command);
			this._contextMenuService.showContextMenu({ getAnchor: () => target, getActions: () => actions });
		}));
	}

	private _createHover(target: HTMLElement, command: ITerminalCommand): void {
		this._register(dom.addDisposableListener(target, dom.EventType.MOUSE_ENTER, async () => {
			let hoverContent = `${localize('terminal-prompt-context-menu', "Show Actions")}` + ` ...${command.getTimeFromNow()} `;
			if (command.exitCode) {
				hoverContent += `\n\n\n\nExit Code: ${command.exitCode} `;
			}
			const hoverOptions = { content: new MarkdownString(hoverContent), target };
			await this._hoverDelayer.trigger(() => {
				this._hoverService.showHover(hoverOptions);
			});
		}));
		this._register(dom.addDisposableListener(target, dom.EventType.MOUSE_LEAVE, async () => {
			this._hoverService.hideHover();
		}));
	}

	private async _getCommandActions(command: ITerminalCommand): Promise<IAction[]> {
		const actions: IAction[] = [];
		if (command.hasOutput) {
			actions.push({
				class: 'copy-output', tooltip: 'Copy Output', dispose: () => { }, id: 'terminal.copyOutput', label: localize("terminal.copyOutput", 'Copy Output'), enabled: true,
				run: async () => {
					await this._clipboardService.writeText(command.getOutput()!);
				}
			});
		}
		actions.push({
			class: 'rerun-command', tooltip: 'Rerun Command', dispose: () => { }, id: 'terminal.rerunCommand', label: localize("terminal.rerunCommand", 'Re-run Command'), enabled: true,
			run: async () => {
				this._onDidRequestRunCommand.fire(command.command);
			}
		});
		return actions;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const commandDecorationSuccessColor = theme.getColor(TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR);
	collector.addRule(`.${DecorationSelector.CommandDecoration} { background-color: ${commandDecorationSuccessColor ? commandDecorationSuccessColor.toString() : ''}; }`);
	const commandDecorationErrorColor = theme.getColor(TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR);
	collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.Error} { background-color: ${commandDecorationErrorColor ? commandDecorationErrorColor.toString() : ''}; }`);
});
