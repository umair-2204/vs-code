/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./findInput';
import nls = require('vs/nls');
import Builder = require('vs/base/browser/builder');
import mouse = require('vs/base/browser/mouseEvent');
import keyboard = require('vs/base/browser/keyboardEvent');
import InputBox = require('vs/base/browser/ui/inputbox/inputBox');
import Checkbox = require('vs/base/browser/ui/checkbox/checkbox');
import ContextView = require('vs/base/browser/ui/contextview/contextview');
import EditorBrowser = require('vs/editor/browser/editorBrowser');

var $ = Builder.$;

export interface IOptions {
	placeholder?:string;
	width?:number;
	validation?:InputBox.IInputValidator;
	label:string;
}

export class FindInput {

	static OPTION_CHANGE:string = 'optionChange';

	private contextViewProvider: ContextView.IContextViewProvider;
	private onOptionChange:(event:Event)=>void;
	private width:number;
	private placeholder:string;
	private validation:InputBox.IInputValidator;
	private label:string;
	private editor:EditorBrowser.ICodeEditor;

	private listenersToRemove:{():void;}[];
	private regex:Checkbox.Checkbox;
	private wholeWords:Checkbox.Checkbox;
	private caseSensitive:Checkbox.Checkbox;
	public domNode: HTMLElement;
	public validationNode: Builder.Builder;
	private inputNode:HTMLInputElement;
	private inputBox:InputBox.InputBox;

	constructor(parent:HTMLElement, contextViewProvider: ContextView.IContextViewProvider, codeEditor:EditorBrowser.ICodeEditor, options?:IOptions) {
		this.contextViewProvider = contextViewProvider;
		this.editor = codeEditor;
		this.onOptionChange = null;
		this.width = options.width || 100;
		this.placeholder = options.placeholder || '';
		this.validation = options.validation;
		this.label = options.label || nls.localize('defaultLabel', "input");

		this.listenersToRemove = [];
		this.regex = null;
		this.wholeWords = null;
		this.caseSensitive = null;
		this.domNode = null;
		this.inputNode = null;
		this.inputBox = null;
		this.validationNode = null;

		this.buildDomNode();

		if(Boolean(parent)) {
			parent.appendChild(this.domNode);
		}
	}

	public destroy(): void {
		this.regex.destroy();
		this.wholeWords.destroy();
		this.caseSensitive.destroy();
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
	}

	public on(eventType:string, handler:(event:Event)=>void): FindInput {
		switch(eventType) {
			case 'keydown':
			case 'keyup':
				$(this.inputBox.inputElement).on(eventType, handler);
				break;
			case FindInput.OPTION_CHANGE:
				this.onOptionChange = handler;
				break;
		}
		return this;
	}

	public enable(): void {
		$(this.domNode).removeClass('disabled');
		this.inputBox.enable();
		this.regex.enable();
		this.wholeWords.enable();
		this.caseSensitive.enable();
	}

	public disable(): void {
		$(this.domNode).addClass('disabled');
		this.inputBox.disable();
		this.regex.disable();
		this.wholeWords.disable();
		this.caseSensitive.disable();
	}

	public clear(): void {
		this.clearValidation();
		this.setValue('');
		this.focus();
	}

	public setWidth(newWidth:number): void {
		this.width = newWidth;
		this.domNode.style.width = this.width + 'px';
		this.contextViewProvider.layout();
		this.setInputWidth();
	}

	public getValue(): string {
		return this.inputBox.value;
	}

	public setValue(value:string): void {
		if (this.inputBox.value !== value) {
			this.inputBox.value = value;
		}
	}

	public select(): void {
		this.inputBox.select();
	}

	public focus(): void {
		this.inputBox.focus();
	}

	public getCaseSensitive():boolean {
		return this.caseSensitive.isChecked;
	}

	public setCaseSensitive(value:boolean): void {
		this.caseSensitive.setChecked(value);
		this.setInputWidth();
	}

	public getWholeWords():boolean {
		return this.wholeWords.isChecked;
	}

	public setWholeWords(value:boolean): void {
		this.wholeWords.setChecked(value);
		this.setInputWidth();
	}

	public getRegex():boolean {
		return this.regex.isChecked;
	}

	public setRegex(value:boolean): void {
		this.regex.setChecked(value);
		this.setInputWidth();
	}

	public focusOnCaseSensitive(): void {
		this.caseSensitive.focus();
	}

	private setInputWidth(): void {
		var w = this.width - this.caseSensitive.width() - this.wholeWords.width() - this.regex.width();
		this.inputBox.width = w;
	}

	private buildDomNode(): void {
		this.domNode = document.createElement('div');
		this.domNode.style.width = this.width + 'px';
		$(this.domNode).addClass('monaco-findInput');

		this.inputBox = new InputBox.InputBox(this.domNode, this.contextViewProvider, {
			placeholder: this.placeholder || '',
			ariaLabel: this.label || '',
			validationOptions: {
				validation: this.validation || null,
				showMessage: true
			}
		});

		this.regex = new Checkbox.Checkbox('regex', nls.localize('regexDescription', "Use Regular Expression"), false, () => {
			this.onOptionChange(null);
			this.inputBox.focus();
			this.setInputWidth();
			this.validate();
		});
		this.wholeWords = new Checkbox.Checkbox('whole-word', nls.localize('wordsDescription', "Match Whole Word"), false, () => {
			this.onOptionChange(null);
			this.inputBox.focus();
			this.setInputWidth();
			this.validate();
		});
		this.caseSensitive = new Checkbox.Checkbox('case-sensitive', nls.localize('caseDescription', "Match Case"), false, () => {
			this.onOptionChange(null);
			this.inputBox.focus();
			this.setInputWidth();
			this.validate();
		});
		this.setInputWidth();

		var controls = document.createElement('div');
		controls.className = 'controls';
		controls.appendChild(this.caseSensitive.domNode);
		controls.appendChild(this.wholeWords.domNode);
		controls.appendChild(this.regex.domNode);

		this.domNode.appendChild(controls);
	}

	public validate(): void {
		this.inputBox.validate();
	}

	public showMessage(message: InputBox.IMessage): void {
		this.inputBox.showMessage(message);
	}

	public clearMessage(): void {
		this.inputBox.hideMessage();
	}

	private clearValidation(): void {
		this.inputBox.hideMessage();
	}
}
