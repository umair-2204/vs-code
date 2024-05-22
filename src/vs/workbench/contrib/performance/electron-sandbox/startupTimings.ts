/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { timeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService } from 'vs/platform/update/common/update';
import { INativeHostService } from 'vs/platform/native/common/native';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { VSBuffer } from 'vs/base/common/buffer';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { StartupTimings } from 'vs/workbench/contrib/performance/browser/startupTimings';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { coalesce } from 'vs/base/common/arrays';

interface ITracingData {
	readonly args?: {
		readonly usedHeapSizeAfter?: number;
		readonly usedHeapSizeBefore?: number;
	};
	readonly dur: number; 	// in microseconds
	readonly name: string;	// e.g. MinorGC or MajorGC
	readonly pid: number;
}

interface IHeapStatistics {
	readonly used: number;
	readonly allocated: number;
	readonly garbage: number;
	readonly majorGCs: number;
	readonly minorGCs: number;
	readonly duration: number;
}

export class NativeStartupTimings extends StartupTimings implements IWorkbenchContribution {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITimerService private readonly _timerService: ITimerService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IEditorService editorService: IEditorService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IUpdateService updateService: IUpdateService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceTrustManagementService workspaceTrustService: IWorkspaceTrustManagementService
	) {
		super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);

		this._report().catch(onUnexpectedError);
	}

	private async _report() {
		const standardStartupError = await this._isStandardStartup();
		this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
	}

	private async _appendStartupTimes(standardStartupError: string | undefined) {
		const appendTo = this._environmentService.args['prof-append-timers'];
		const durationMarkers = this._environmentService.args['prof-duration-markers'];
		const durationMarkersFile = this._environmentService.args['prof-duration-markers-file'];
		if (!appendTo && !durationMarkers) {
			// nothing to do
			return;
		}

		try {
			await Promise.all([
				this._timerService.whenReady(),
				timeout(15000), // wait: cached data creation, telemetry sending
			]);

			const perfBaseline = await this._timerService.perfBaseline;
			const heapStatistics = await this._resolveStartupHeapStatistics();
			if (heapStatistics) {
				this._telemetryLogHeapStatistics(heapStatistics);
			}

			if (appendTo) {
				const content = coalesce([
					this._timerService.startupMetrics.ellapsed,
					this._productService.nameShort,
					(this._productService.commit || '').slice(0, 10) || '0000000000',
					this._telemetryService.sessionId,
					standardStartupError === undefined ? 'standard_start' : `NO_standard_start : ${standardStartupError}`,
					`${String(perfBaseline).padStart(4, '0')}ms`,
					heapStatistics ? this._printStartupHeapStatistics(heapStatistics) : undefined
				]).join('\t') + '\n';
				await this._appendContent(URI.file(appendTo), content);
			}

			if (durationMarkers?.length) {
				const durations: string[] = [];
				for (const durationMarker of durationMarkers) {
					let duration: number = 0;
					if (durationMarker === 'ellapsed') {
						duration = this._timerService.startupMetrics.ellapsed;
					} else if (durationMarker.indexOf('-') !== -1) {
						const markers = durationMarker.split('-');
						if (markers.length === 2) {
							duration = this._timerService.getDuration(markers[0], markers[1]);
						}
					}
					if (duration) {
						durations.push(durationMarker);
						durations.push(`${duration}`);
					}
				}

				const durationsContent = `${durations.join('\t')}\n`;
				if (durationMarkersFile) {
					await this._appendContent(URI.file(durationMarkersFile), durationsContent);
				} else {
					console.log(durationsContent);
				}
			}

		} catch (err) {
			console.error(err);
		} finally {
			this._nativeHostService.exit(0);
		}
	}

	protected override async _isStandardStartup(): Promise<string | undefined> {
		const windowCount = await this._nativeHostService.getWindowCount();
		if (windowCount !== 1) {
			return `Expected window count : 1, Actual : ${windowCount}`;
		}
		return super._isStandardStartup();
	}

	private async _appendContent(file: URI, content: string): Promise<void> {
		const chunks: VSBuffer[] = [];
		if (await this._fileService.exists(file)) {
			chunks.push((await this._fileService.readFile(file)).value);
		}
		chunks.push(VSBuffer.fromString(content));
		await this._fileService.writeFile(file, VSBuffer.concat(chunks));
	}

	private async _resolveStartupHeapStatistics(): Promise<IHeapStatistics | undefined> {
		if (
			!this._environmentService.args['enable-tracing'] ||
			!this._environmentService.args['trace-startup-file'] ||
			this._environmentService.args['trace-startup-format'] !== 'json' ||
			!this._environmentService.args['trace-startup-duration']
		) {
			return undefined; // unexpected arguments for startup heap statistics
		}

		let minorGCs = 0;
		let majorGCs = 0;
		const used = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0;
		let allocated = 0;
		let garbage = 0;
		let duration = 0;

		try {
			const traceContents: { traceEvents: ITracingData[] } = JSON.parse((await this._fileService.readFile(URI.file(this._environmentService.args['trace-startup-file']))).value.toString());
			for (const event of traceContents.traceEvents) {
				if (event.pid !== process.pid) {
					continue;
				}

				switch (event.name) {

					// Major/Minor GC Events
					case 'MinorGC':
						minorGCs++;
					case 'MajorGC':
						majorGCs++;
						if (event.args && typeof event.args.usedHeapSizeAfter === 'number' && typeof event.args.usedHeapSizeBefore === 'number') {
							garbage += (event.args.usedHeapSizeBefore - event.args.usedHeapSizeAfter);
							allocated = event.args.usedHeapSizeAfter + garbage;
						}
						break;

					// GC Events that block the event loop
					case 'V8.GCFinalizeMC':
					case 'V8.GCScavenger':
						duration += event.dur;
						break;
				}
			}

			return { minorGCs, majorGCs, used, allocated, garbage, duration: Math.round(duration / 1000) };
		} catch (error) {
			console.error(error);
		}

		return undefined;
	}

	private _telemetryLogHeapStatistics({ used, allocated, garbage, majorGCs, minorGCs, duration }: IHeapStatistics): void {
		type StartupHeapStatisticsClassification = {
			owner: 'bpasero';
			comment: 'An event that reports startup heap statistics for performance analysis.';
			heapUsed: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Used heap' };
			heapAllocated: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allocated heap' };
			heapGarbage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Garbage heap' };
			majorGCs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Major GCs count' };
			minorGCs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Minor GCs count' };
			gcsDuration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'GCs duration' };
		};
		type StartupHeapStatisticsEvent = {
			heapUsed: number;
			heapAllocated: number;
			heapGarbage: number;
			majorGCs: number;
			minorGCs: number;
			gcsDuration: number;
		};
		this._telemetryService.publicLog2<StartupHeapStatisticsEvent, StartupHeapStatisticsClassification>('startupHeapStatistics', {
			heapUsed: used,
			heapAllocated: allocated,
			heapGarbage: garbage,
			majorGCs,
			minorGCs,
			gcsDuration: duration
		});
	}

	private _printStartupHeapStatistics({ used, allocated, garbage, majorGCs, minorGCs, duration }: IHeapStatistics) {
		const MB = 1024 * 1024;
		return `Heap: ${Math.round(used / MB)}MB (used) ${Math.round(allocated / MB)}MB (allocated) ${Math.round(garbage / MB)}MB (garbage) ${majorGCs} (MajorGC) ${minorGCs} (MinorGC) ${duration}ms (GC duration)`;
	}
}
