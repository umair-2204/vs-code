/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow, Details, MessageChannelMain, app } from 'electron';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { StringDecoder } from 'string_decoder';
import { timeout } from 'vs/base/common/async';
import { FileAccess } from 'vs/base/common/network';
import { UtilityProcess as ElectronUtilityProcess, UtilityProcessProposedApi, canUseUtilityProcess } from 'vs/base/parts/sandbox/electron-main/electronTypes';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import Severity from 'vs/base/common/severity';

export interface IUtilityProcessConfiguration {

	// --- message port response related

	readonly responseWindowId: number;
	readonly responseChannel: string;
	readonly responseNonce: string;

	// --- utility process options

	/**
	 * A way to identify the utility process among others.
	 */
	readonly name: string;

	/**
	 * Environment key-value pairs. Default is `process.env`.
	 */
	readonly env?: { [key: string]: string | undefined };

	/**
	 * List of string arguments that will be available as `process.argv`
	 * in the child process.
	 */
	readonly args?: string[];

	/**
	 * List of string arguments passed to the executable.
	 */
	readonly execArgv?: string[];

	/**
	 * Allow the utility process to load unsigned libraries.
	 */
	readonly allowLoadingUnsignedLibraries?: boolean;
}

export interface IUtilityProcessExitEvent {

	/**
	 * The process id of the process that exited.
	 */
	readonly pid: number;

	/**
	 * The exit code of the process.
	 */
	readonly code: number;

	/**
	 * The signal that caused the process to exit is unknown
	 * for utility processes.
	 */
	readonly signal: 'unknown';
}

export class UtilityProcess extends Disposable {

	private static ID_COUNTER = 0;

	private readonly id = String(++UtilityProcess.ID_COUNTER);

	private readonly _onStdout = this._register(new Emitter<string>());
	readonly onStdout = this._onStdout.event;

	private readonly _onStderr = this._register(new Emitter<string>());
	readonly onStderr = this._onStderr.event;

	private readonly _onMessage = this._register(new Emitter<unknown>());
	readonly onMessage = this._onMessage.event;

	private readonly _onExit = this._register(new Emitter<IUtilityProcessExitEvent>());
	readonly onExit = this._onExit.event;

	private process: UtilityProcessProposedApi.UtilityProcess | undefined = undefined;
	private processPid: number | undefined = undefined;
	private configuration: IUtilityProcessConfiguration | undefined = undefined;

	private didExit: boolean = false;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService
	) {
		super();
	}

	private log(msg: string, severity: Severity): void {
		const logMsg = `[UtilityProcess id: ${this.id}, name: ${this.configuration?.name}, pid: ${this.processPid ?? '<none>'}]: ${msg}`;
		switch (severity) {
			case Severity.Error:
				this.logService.error(logMsg);
				break;
			case Severity.Warning:
				this.logService.warn(logMsg);
				break;
			case Severity.Info:
				this.logService.info(logMsg);
				break;
		}
	}

	private validateCanStart(configuration: IUtilityProcessConfiguration): BrowserWindow | undefined {
		if (!canUseUtilityProcess) {
			throw new Error(`Cannot use UtilityProcess!`);
		}

		if (this.process) {
			this.log('Cannot start utility process because it is already running...', Severity.Error);
			return undefined;
		}

		const responseWindow = this.windowsMainService.getWindowById(configuration.responseWindowId)?.win;
		if (!responseWindow || responseWindow.isDestroyed() || responseWindow.webContents.isDestroyed()) {
			this.log('Refusing to start utility process because requesting window cannot be found or is destroyed...', Severity.Error);
			return undefined;
		}

		return responseWindow;
	}

	start(configuration: IUtilityProcessConfiguration): void {
		const responseWindow = this.validateCanStart(configuration);
		if (!responseWindow) {
			return;
		}

		this.configuration = configuration;

		const serviceName = `${this.configuration.name}-${this.id}`;
		const modulePath = FileAccess.asFileUri('bootstrap-fork.js').fsPath;
		const args = this.configuration.args;
		const execArgv = this.configuration.execArgv;
		const allowLoadingUnsignedLibraries = this.configuration.allowLoadingUnsignedLibraries;
		const stdio = 'pipe';

		let env: { [key: string]: any } | undefined = this.configuration.env;
		if (env) {
			env = { ...env }; // make a copy since we may be going to mutate it

			for (const key of Object.keys(env)) {
				env[key] = String(env[key]); // make sure all values are strings, otherwise the process will not start
			}
		}

		this.log('creating new...', Severity.Info);

		// Fork utility process
		this.process = ElectronUtilityProcess.fork(modulePath, args, {
			serviceName,
			env,
			execArgv,
			allowLoadingUnsignedLibraries,
			stdio
		});

		// Register to events
		this.registerListeners(this.process, serviceName);

		// Create message ports
		this.createMessagePorts(this.process, this.configuration, responseWindow);
	}

	private createMessagePorts(process: UtilityProcessProposedApi.UtilityProcess, configuration: IUtilityProcessConfiguration, responseWindow: BrowserWindow) {
		const { port1: windowPort, port2: utilityProcessPort } = new MessageChannelMain();

		process.postMessage('null', [utilityProcessPort]);
		responseWindow.webContents.postMessage(configuration.responseChannel, configuration.responseNonce, [windowPort]);
	}

	private registerListeners(process: UtilityProcessProposedApi.UtilityProcess, serviceName: string): void {

		// Stdout
		const stdoutDecoder = new StringDecoder('utf-8');
		process.stdout?.on('data', chunk => this._onStdout.fire(typeof chunk === 'string' ? chunk : stdoutDecoder.write(chunk)));

		// Stderr
		const stderrDecoder = new StringDecoder('utf-8');
		process.stderr?.on('data', chunk => this._onStderr.fire(typeof chunk === 'string' ? chunk : stderrDecoder.write(chunk)));

		//Messages
		process.on('message', msg => this._onMessage.fire(msg));

		// Spawn
		this._register(Event.fromNodeEventEmitter<void>(process, 'spawn')(() => {
			this.processPid = process.pid;

			this.log(`received spawn event`, Severity.Info);
		}));

		// Exit
		this._register(Event.fromNodeEventEmitter<number>(process, 'exit')(code => {
			this.log(`received exit event with code ${code}`, Severity.Info);

			this.handleDidExit(code);
		}));

		// Child process gone
		this._register(Event.fromNodeEventEmitter<{ details: Details }>(app, 'child-process-gone', (event, details) => ({ event, details }))(({ details }) => {
			if (details.type === 'Utility' && details.name === serviceName) {
				this.log(`received child-process-gone event with code ${details.exitCode} and reason ${details.reason}`, Severity.Error);

				this.handleDidExit(details.exitCode);
			}
		}));
	}

	private handleDidExit(code: number): void {
		if (this.didExit) {
			return; // already handled
		}

		this.didExit = true;

		this._onExit.fire({ pid: this.processPid!, code, signal: 'unknown' });
	}

	enableInspectPort(): boolean {
		if (typeof this.processPid !== 'number') {
			return false;
		}

		this.log('enabling inspect port', Severity.Info);

		interface ProcessExt {
			_debugProcess?(pid: number): unknown;
		}

		// use (undocumented) _debugProcess feature of node if available
		if (typeof (<ProcessExt>process)._debugProcess === 'function') {
			(<ProcessExt>process)._debugProcess!(this.processPid);
			return true;
		}

		// not supported...
		return false;
	}

	kill(): void {
		if (!this.process) {
			this.log(`no running process to kill`, Severity.Warning);
			return;
		}

		this.log(`killing the process`, Severity.Info);
		this.process.kill();
	}

	async waitForExit(maxWaitTimeMs: number): Promise<void> {
		if (!this.process) {
			this.log(`no running process to wait for exit`, Severity.Warning);
			return;
		}

		if (this.didExit) {
			return;
		}

		this.log('waiting to exit...', Severity.Info);
		await Promise.race([Event.toPromise(this.onExit), timeout(maxWaitTimeMs)]);

		if (!this.didExit) {
			this.log(`did not exit within ${maxWaitTimeMs}ms, will kill it now...`, Severity.Info);
			this.process.kill();
		}
	}
}
