/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// include these in the editor bundle because they are widely used by many languages
import 'vs/editor/common/languages.common';
import Severity from 'vs/base/common/severity';
import {TPromise} from 'vs/base/common/winjs.base';
import {WorkerServer} from 'vs/base/common/worker/workerServer';
import {EventService} from 'vs/platform/event/common/eventService';
import {IEventService} from 'vs/platform/event/common/event';
import {AbstractExtensionService, ActivatedExtension} from 'vs/platform/extensions/common/abstractExtensionService';
import {IExtensionDescription, IExtensionService} from 'vs/platform/extensions/common/extensions';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {IRequestService} from 'vs/platform/request/common/request';
import {NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ModeServiceImpl} from 'vs/editor/common/services/modeServiceImpl';
import {IModeService, ILanguageExtensionPoint} from 'vs/editor/common/services/modeService';
import {ResourceService} from 'vs/editor/common/services/resourceServiceImpl';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {CompatWorkerServiceWorker} from 'vs/editor/common/services/compatWorkerServiceWorker';
import {ICompatWorkerService} from 'vs/editor/common/services/compatWorkerService';
import {ILegacyLanguageDefinition} from 'vs/editor/common/modes/modesRegistry';

export interface IInitData {
	contextService: {
		workspace:any;
		configuration:any;
		options:any;
	};
	modesRegistryData?: {
		compatModes: ILegacyLanguageDefinition[];
		languages: ILanguageExtensionPoint[];
	};
}

export interface ICallback {
	(something:any):void;
}

class WorkerExtensionService extends AbstractExtensionService<ActivatedExtension> {

	constructor() {
		super(true);
	}

	protected _showMessage(severity:Severity, msg:string): void {
		switch (severity) {
			case Severity.Error:
				console.error(msg);
				break;
			case Severity.Warning:
				console.warn(msg);
				break;
			case Severity.Info:
				console.info(msg);
				break;
			default:
				console.log(msg);
		}
	}

	protected _createFailedExtension(): ActivatedExtension {
		throw new Error('unexpected');
	}

	protected _actualActivateExtension(extensionDescription: IExtensionDescription): TPromise<ActivatedExtension> {
		throw new Error('unexpected');
	}
}

export class EditorWorkerServer {

	private compatWorkerService:CompatWorkerServiceWorker;

	constructor() {
	}

	public initialize(mainThread:WorkerServer, complete:ICallback, error:ICallback, progress:ICallback, initData:IInitData):void {

		const services = new ServiceCollection();
		const instantiationService = new InstantiationService(services);

		const extensionService = new WorkerExtensionService();
		services.set(IExtensionService, extensionService);

		const contextService = new BaseWorkspaceContextService(initData.contextService.workspace, initData.contextService.configuration, initData.contextService.options);
		services.set(IWorkspaceContextService, contextService);

		const resourceService = new ResourceService();
		services.set(IResourceService, resourceService);

		const requestService = new BaseRequestService(contextService, NullTelemetryService);
		services.set(IRequestService, requestService);

		services.set(IEventService, new EventService());

		const modeService = new ModeServiceImpl(instantiationService, extensionService);
		services.set(IModeService, modeService);

		this.compatWorkerService = new CompatWorkerServiceWorker(resourceService, modeService, mainThread.getRemoteCom(), initData.modesRegistryData);
		services.set(ICompatWorkerService, this.compatWorkerService);

		complete(undefined);
	}

	public request(mainThread:WorkerServer, complete:ICallback, error:ICallback, progress:ICallback, data:any):void {
		throw new Error('unexpected!');
	}
}

export var value = new EditorWorkerServer();
