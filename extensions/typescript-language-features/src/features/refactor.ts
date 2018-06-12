/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';

import * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import FormattingOptionsManager from './fileConfigurationManager';
import { CommandManager, Command } from '../utils/commandManager';
import { VersionDependentRegistration } from '../utils/dependentRegistration';
import API from '../utils/api';

class ApplyRefactoringCommand implements Command {
	public static readonly ID = '_typescript.applyRefactoring';
	public readonly id = ApplyRefactoringCommand.ID;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(
		document: vscode.TextDocument,
		file: string,
		refactor: string,
		action: string,
		range: vscode.Range
	): Promise<boolean> {
		const args: Proto.GetEditsForRefactorRequestArgs = {
			...typeConverters.Range.toFileRangeRequestArgs(file, range),
			refactor,
			action
		};
		const response = await this.client.execute('getEditsForRefactor', args);
		if (!response || !response.body || !response.body.edits.length) {
			return false;
		}

		for (const edit of response.body.edits) {
			try {
				await vscode.workspace.openTextDocument(edit.fileName);
			} catch {
				try {
					if (!fs.existsSync(edit.fileName)) {
						fs.writeFileSync(edit.fileName, '');
					}
				} catch {
					// noop
				}
			}
		}

		const edit = typeConverters.WorkspaceEdit.fromFromFileCodeEdits(this.client, response.body.edits);
		if (!(await vscode.workspace.applyEdit(edit))) {
			return false;
		}

		const renameLocation = response.body.renameLocation;
		if (renameLocation) {
			await vscode.commands.executeCommand('editor.action.rename', [
				document.uri,
				typeConverters.Position.fromLocation(renameLocation)
			]);
		}
		return true;
	}
}

class SelectRefactorCommand implements Command {
	public static readonly ID = '_typescript.selectRefactoring';
	public readonly id = SelectRefactorCommand.ID;

	constructor(
		private readonly doRefactoring: ApplyRefactoringCommand
	) { }

	public async execute(
		document: vscode.TextDocument,
		file: string,
		info: Proto.ApplicableRefactorInfo,
		range: vscode.Range
	): Promise<boolean> {
		const selected = await vscode.window.showQuickPick(info.actions.map((action): vscode.QuickPickItem => ({
			label: action.name,
			description: action.description
		})));
		if (!selected) {
			return false;
		}
		return this.doRefactoring.execute(document, file, info.name, selected.label, range);
	}
}

class TypeScriptRefactorProvider implements vscode.CodeActionProvider {
	private static readonly extractFunctionKind = vscode.CodeActionKind.RefactorExtract.append('function');
	private static readonly extractConstantKind = vscode.CodeActionKind.RefactorExtract.append('constant');
	private static readonly moveKind = vscode.CodeActionKind.Refactor.append('move');

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly formattingOptionsManager: FormattingOptionsManager,
		commandManager: CommandManager
	) {
		const doRefactoringCommand = commandManager.register(new ApplyRefactoringCommand(this.client));
		commandManager.register(new SelectRefactorCommand(doRefactoringCommand));
	}

	public static readonly metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [vscode.CodeActionKind.Refactor]
	};

	public async provideCodeActions(
		document: vscode.TextDocument,
		rangeOrSelection: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): Promise<vscode.CodeAction[] | undefined> {
		if (!this.shouldTrigger(rangeOrSelection, context)) {
			return undefined;
		}

		const file = this.client.toPath(document.uri);
		if (!file) {
			return undefined;
		}

		await this.formattingOptionsManager.ensureConfigurationForDocument(document, undefined);

		const args: Proto.GetApplicableRefactorsRequestArgs = typeConverters.Range.toFileRangeRequestArgs(file, rangeOrSelection);
		let response: Proto.GetApplicableRefactorsResponse;
		try {
			response = await this.client.execute('getApplicableRefactors', args, token);
			if (!response || !response.body) {
				return undefined;
			}
		} catch {
			return undefined;
		}

		return this.convertApplicableRefactors(response.body, document, file, rangeOrSelection);
	}

	private convertApplicableRefactors(
		body: Proto.ApplicableRefactorInfo[],
		document: vscode.TextDocument,
		file: string,
		rangeOrSelection: vscode.Range | vscode.Selection
	) {
		const actions: vscode.CodeAction[] = [];
		for (const info of body) {
			if (info.inlineable === false) {
				const codeAction = new vscode.CodeAction(info.description, vscode.CodeActionKind.Refactor);
				codeAction.command = {
					title: info.description,
					command: SelectRefactorCommand.ID,
					arguments: [document, file, info, rangeOrSelection]
				};
				actions.push(codeAction);
			} else {
				for (const action of info.actions) {
					actions.push(this.refactorActionToCodeAction(action, document, file, info, rangeOrSelection));
				}
			}
		}
		return actions;
	}

	private refactorActionToCodeAction(
		action: Proto.RefactorActionInfo,
		document: vscode.TextDocument,
		file: string,
		info: Proto.ApplicableRefactorInfo,
		rangeOrSelection: vscode.Range | vscode.Selection
	) {
		const codeAction = new vscode.CodeAction(action.description, TypeScriptRefactorProvider.getKind(action));
		codeAction.command = {
			title: action.description,
			command: ApplyRefactoringCommand.ID,
			arguments: [document, file, info.name, action.name, rangeOrSelection],
		};
		return codeAction;
	}

	private shouldTrigger(rangeOrSelection: vscode.Range | vscode.Selection, context: vscode.CodeActionContext) {
		if (context.only && !vscode.CodeActionKind.Refactor.contains(context.only)) {
			return false;
		}

		return rangeOrSelection instanceof vscode.Selection && (!rangeOrSelection.isEmpty || context.triggerKind === vscode.CodeActionTrigger.Manual);
	}

	private static getKind(refactor: Proto.RefactorActionInfo) {
		if (refactor.name.startsWith('function_')) {
			return TypeScriptRefactorProvider.extractFunctionKind;
		} else if (refactor.name.startsWith('constant_')) {
			return TypeScriptRefactorProvider.extractConstantKind;
		} else if (refactor.name.startsWith('Move')) {
			return TypeScriptRefactorProvider.moveKind;
		}
		return vscode.CodeActionKind.Refactor;
	}
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	formattingOptionsManager: FormattingOptionsManager,
	commandManager: CommandManager,
) {
	return new VersionDependentRegistration(client, API.v240, () => {
		return vscode.languages.registerCodeActionsProvider(selector,
			new TypeScriptRefactorProvider(client, formattingOptionsManager, commandManager),
			TypeScriptRefactorProvider.metadata);
	});
}
