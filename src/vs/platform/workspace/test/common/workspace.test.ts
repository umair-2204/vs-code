/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { Workspace, WorkspaceFolder, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import URI from 'vs/base/common/uri';

suite('Workspace', () => {

	test('getFolder returns the folder with given uri', () => {
		const expected = aWorkspaceFolder(URI.file('/src/test'));
		let testObject = new Workspace('', '', [aWorkspaceFolder(URI.file('/src/main')), expected, aWorkspaceFolder(URI.file('/src/code'))]);

		const actual = testObject.getFolder(expected.uri);

		assert.equal(actual, expected);
	});

	test('getFolder returns the folder if the uri is sub', () => {
		const expected = aWorkspaceFolder(URI.file('/src/test'));
		let testObject = new Workspace('', '', [expected, aWorkspaceFolder(URI.file('/src/main')), aWorkspaceFolder(URI.file('/src/code'))]);

		const actual = testObject.getFolder(URI.file('/src/test/a'));

		assert.equal(actual, expected);
	});

	test('getFolder returns the closest folder if the uri is sub', () => {
		const expected = aWorkspaceFolder(URI.file('/src/test'));
		let testObject = new Workspace('', '', [aWorkspaceFolder(URI.file('/src/code')), aWorkspaceFolder(URI.file('/src')), expected]);

		const actual = testObject.getFolder(URI.file('/src/test/a'));

		assert.equal(actual, expected);
	});

	test('getFolder returns null if the uri is not sub', () => {
		let testObject = new Workspace('', '', [aWorkspaceFolder(URI.file('/src/code')), aWorkspaceFolder(URI.file('/src/test'))]);

		const actual = testObject.getFolder(URI.file('/src/main/a'));

		assert.equal(actual, undefined);
	});

	test('toWorkspaceFolders with single absolute folder', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test' }]);

		assert.equal(actual.length, 1);
		assert.equal(actual[0].uri.fsPath, '/src/test');
		assert.equal(actual[0].raw, '/src/test');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test');
	});

	test('toWorkspaceFolders with single relative folder', () => {
		const actual = toWorkspaceFolders([{ path: './test' }], URI.file('src'));

		assert.equal(actual.length, 1);
		assert.equal(actual[0].uri.fsPath, '/src/test');
		assert.equal(actual[0].raw, './test');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test');
	});

	test('toWorkspaceFolders with single absolute folder with name', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test', name: 'hello' }]);

		assert.equal(actual.length, 1);
		assert.equal(actual[0].uri.fsPath, '/src/test');
		assert.equal(actual[0].raw, '/src/test');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'hello');
	});

	test('toWorkspaceFolders with multiple unique absolute folders', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test3' }, { path: '/src/test1' }]);

		assert.equal(actual.length, 3);
		assert.equal(actual[0].uri.fsPath, '/src/test2');
		assert.equal(actual[0].raw, '/src/test2');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test2');

		assert.equal(actual[1].uri.fsPath, '/src/test3');
		assert.equal(actual[1].raw, '/src/test3');
		assert.equal(actual[1].index, 1);
		assert.equal(actual[1].name, 'test3');

		assert.equal(actual[2].uri.fsPath, '/src/test1');
		assert.equal(actual[2].raw, '/src/test1');
		assert.equal(actual[2].index, 2);
		assert.equal(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple unique absolute folders with names', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test3', name: 'noName' }, { path: '/src/test1' }]);

		assert.equal(actual.length, 3);
		assert.equal(actual[0].uri.fsPath, '/src/test2');
		assert.equal(actual[0].raw, '/src/test2');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test2');

		assert.equal(actual[1].uri.fsPath, '/src/test3');
		assert.equal(actual[1].raw, '/src/test3');
		assert.equal(actual[1].index, 1);
		assert.equal(actual[1].name, 'noName');

		assert.equal(actual[2].uri.fsPath, '/src/test1');
		assert.equal(actual[2].raw, '/src/test1');
		assert.equal(actual[2].index, 2);
		assert.equal(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple unique absolute and relative folders', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/abc/test3', name: 'noName' }, { path: './test1' }], URI.file('src'));

		assert.equal(actual.length, 3);
		assert.equal(actual[0].uri.fsPath, '/src/test2');
		assert.equal(actual[0].raw, '/src/test2');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test2');

		assert.equal(actual[1].uri.fsPath, '/abc/test3');
		assert.equal(actual[1].raw, '/abc/test3');
		assert.equal(actual[1].index, 1);
		assert.equal(actual[1].name, 'noName');

		assert.equal(actual[2].uri.fsPath, '/src/test1');
		assert.equal(actual[2].raw, './test1');
		assert.equal(actual[2].index, 2);
		assert.equal(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple absolute folders with duplicates', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test2', name: 'noName' }, { path: '/src/test1' }]);

		assert.equal(actual.length, 2);
		assert.equal(actual[0].uri.fsPath, '/src/test2');
		assert.equal(actual[0].raw, '/src/test2');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test2');

		assert.equal(actual[1].uri.fsPath, '/src/test1');
		assert.equal(actual[1].raw, '/src/test1');
		assert.equal(actual[1].index, 1);
		assert.equal(actual[1].name, 'test1');
	});

	test('toWorkspaceFolders with multiple absolute and relative folders with duplicates', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '/src/test3', name: 'noName' }, { path: './test3' }, { path: '/abc/test1' }], URI.file('src'));

		assert.equal(actual.length, 3);
		assert.equal(actual[0].uri.fsPath, '/src/test2');
		assert.equal(actual[0].raw, '/src/test2');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test2');

		assert.equal(actual[1].uri.fsPath, '/src/test3');
		assert.equal(actual[1].raw, '/src/test3');
		assert.equal(actual[1].index, 1);
		assert.equal(actual[1].name, 'noName');

		assert.equal(actual[2].uri.fsPath, '/abc/test1');
		assert.equal(actual[2].raw, '/abc/test1');
		assert.equal(actual[2].index, 2);
		assert.equal(actual[2].name, 'test1');
	});

	test('toWorkspaceFolders with multiple absolute and relative folders with invalid paths', () => {
		const actual = toWorkspaceFolders([{ path: '/src/test2' }, { path: '', name: 'noName' }, { path: './test3' }, { path: '/abc/test1' }], URI.file('src'));

		assert.equal(actual.length, 3);
		assert.equal(actual[0].uri.fsPath, '/src/test2');
		assert.equal(actual[0].raw, '/src/test2');
		assert.equal(actual[0].index, 0);
		assert.equal(actual[0].name, 'test2');

		assert.equal(actual[1].uri.fsPath, '/src/test3');
		assert.equal(actual[1].raw, './test3');
		assert.equal(actual[1].index, 1);
		assert.equal(actual[1].name, 'test3');

		assert.equal(actual[2].uri.fsPath, '/abc/test1');
		assert.equal(actual[2].raw, '/abc/test1');
		assert.equal(actual[2].index, 2);
		assert.equal(actual[2].name, 'test1');
	});

	function aWorkspaceFolder(uri: URI, index: number = 0): WorkspaceFolder {
		return { uri, raw: uri.fsPath, index, name: '' };
	}

});