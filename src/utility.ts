// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Uri, window, workspace, WorkspaceFolder } from "vscode";
import { setUserError } from "vscode-extension-telemetry-wrapper";
import { INodeData } from "./java/nodeData";
import { languageServerApiManager } from "./languageServerApi/languageServerApiManager";

export class Utility {

    public static getDefaultWorkspaceFolder(): WorkspaceFolder | undefined {
        if (workspace.workspaceFolders === undefined) {
            return undefined;
        }
        if (workspace.workspaceFolders.length === 1) {
            return workspace.workspaceFolders[0];
        }
        if (window.activeTextEditor) {
            const activeWorkspaceFolder: WorkspaceFolder | undefined =
                workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
            return activeWorkspaceFolder;
        }
        return undefined;
    }

    public static async isRevealable(uri: Uri): Promise<boolean> {
        if (!SUPPORTED_URI_SCHEMES.includes(uri.scheme)) {
            return false;
        }
        if (uri.scheme === "file" && !workspace.getWorkspaceFolder(uri)) {
            return false;
        }

        return languageServerApiManager.ready();
    }
}

export class EventCounter {
    public static dict: {[key: string]: number} = {};

    public static increase(event: string) {
        const count = this.dict[event] ?? 0;
        this.dict[event] = count + 1;
    }
}

export class UserError extends Error {
    public context: ITroubleshootingMessage;

    constructor(context: ITroubleshootingMessage) {
        super(context.message);
        this.context = context;
        setUserError(this);
    }
}

interface IProperties {
    [key: string]: string;
}

interface ILoggingMessage {
    message: string;
    type?: Type;
    details?: IProperties;
}

interface ITroubleshootingMessage extends ILoggingMessage {
    anchor?: string;
}

export enum Type {
    EXCEPTION = "exception",
    USAGEDATA = "usageData",
    USAGEERROR = "usageError",
    ACTIVATEEXTENSION = "activateExtension", // TODO: Activation belongs to usage data, remove this category.
}

const keywords: Set<string> = new Set([
    "abstract", "default", "if", "private", "this", "boolean", "do", "implements", "protected", "throw", "break", "double", "import",
    "public", "throws", "byte", "else", "instanceof", "return", "transient", "case", "extends", "int", "short", "try", "catch", "final",
    "interface", "static", "void", "char", "finally", "long", "strictfp", "volatile", "class", "float", "native", "super", "while",
    "const", "for", "new", "switch", "continue", "goto", "package", "synchronized", "true", "false", "null", "assert", "enum",
]);

const SUPPORTED_URI_SCHEMES: string[] = ["file", "jdt"];

export function isKeyword(identifier: string): boolean {
    return keywords.has(identifier);
}

// Java identifier per JLS §3.8: start with a Unicode letter, underscore, or dollar sign;
// continue with Unicode letters, digits, underscore, dollar sign, or combining marks.
const identifierRegExp: RegExp = /^[\p{L}\p{Nl}_$][\p{L}\p{Nl}\p{Nd}\p{Mn}\p{Mc}\p{Pc}_$\u200c\u200d]*$/u;
export function isJavaIdentifier(identifier: string): boolean {
    return identifierRegExp.test(identifier);
}

export function isTest(nodeData: INodeData | undefined): boolean {
    if (!nodeData) {
        return false;
    }

    if (nodeData.metaData?.test === "true") {
        return true;
    }

    const mavenScope: string = nodeData.metaData?.["maven.scope"] || "";
    if (mavenScope.toLocaleLowerCase().includes("test")) {
        return true;
    }

    const gradleScope: string = nodeData.metaData?.gradle_scope || "";
    if (gradleScope.toLocaleLowerCase().includes("test")) {
        return true;
    }

    return false;
}

/**
 * Normalises a file URI string coming from the language server so that
 * VS Code's workspace-folder lookup works correctly on Windows.
 *
 * Eclipse JDT-LS can return URIs with an upper-case drive letter
 * (e.g. `file:///C:/Users/…`), whereas VS Code registers workspace-folder
 * URIs with a lower-case drive letter (`file:///c:/Users/…`).  The casing
 * mismatch causes VS Code's built-in `copyRelativeFilePath` command to fall
 * back to the absolute path.  Lowercasing the drive letter in the URI path
 * component makes the lookup succeed.
 *
 * On non-Windows platforms (no drive letter) the URI is returned unchanged.
 *
 * @param uriString  Raw URI string coming from the language server.
 * @param platform   Injected OS platform string – defaults to
 *                   `process.platform`.  Accepting it as a parameter makes
 *                   the function unit-testable on Linux/macOS for Windows
 *                   code-paths without requiring a real Windows environment.
 */
export function normalizeFileUri(uriString: string, platform: NodeJS.Platform = process.platform): Uri {
    const uri = Uri.parse(uriString);
    if (platform === "win32") {
        const p = uri.path;
        // A Windows drive letter in a file URI looks like "/C:/" (slash + letter + colon).
        // Normalise it to lower-case so it matches VS Code's workspace-folder URIs.
        if (p.length >= 3 && p[0] === "/" && /[A-Z]/.test(p[1]) && p[2] === ":") {
            return uri.with({ path: "/" + p[1].toLowerCase() + p.slice(2) });
        }
    }
    return uri;
}
