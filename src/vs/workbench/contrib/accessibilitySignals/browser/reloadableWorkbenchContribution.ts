/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHotReloadEnabled } from 'vs/base/common/hotReload';
import { IDisposable } from 'vs/base/common/lifecycle';
import { autorunWithStore } from 'vs/base/common/observable';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export function reloadableClass(getClass: () => any): any {
	if (!isHotReloadEnabled()) {
		return getClass();
	}

	return class Placeholder extends BaseClass {
		private _autorun: IDisposable | undefined = undefined;

		override init() {
			this._autorun = autorunWithStore((reader, store) => {
				const clazz = readHotReloadableExport(getClass(), reader);
				store.add(this.instantiationService.createInstance(clazz));
			});
		}

		dispose(): void {
			this._autorun?.dispose();
		}
	};
}

class BaseClass {
	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		this.init();
	}

	init(): void { }
}
