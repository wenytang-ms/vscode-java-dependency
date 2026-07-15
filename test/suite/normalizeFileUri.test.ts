// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { normalizeFileUri } from "../../extension.bundle";

// tslint:disable: only-arrow-functions
suite("normalizeFileUri Tests", () => {

    test("lowercases upper-case Windows drive letter on win32", function() {
        const result = normalizeFileUri("file:///C:/Users/me/project/App.java", "win32");
        assert.strictEqual(result.toString(), "file:///c:/Users/me/project/App.java");
    });

    test("leaves already-lower-case Windows drive letter unchanged on win32", function() {
        const result = normalizeFileUri("file:///c:/Users/me/project/App.java", "win32");
        assert.strictEqual(result.toString(), "file:///c:/Users/me/project/App.java");
    });

    test("does not modify URI on linux platform", function() {
        const result = normalizeFileUri("file:///C:/Users/me/project/App.java", "linux");
        assert.strictEqual(result.toString(), "file:///C:/Users/me/project/App.java");
    });

    test("does not modify URI on darwin platform", function() {
        const result = normalizeFileUri("file:///C:/Users/me/project/App.java", "darwin");
        assert.strictEqual(result.toString(), "file:///C:/Users/me/project/App.java");
    });

    test("does not modify a non-Windows-style URI path on win32", function() {
        const result = normalizeFileUri("file:///home/user/project/App.java", "win32");
        assert.strictEqual(result.toString(), "file:///home/user/project/App.java");
    });

    test("preserves the rest of the URI path after drive letter normalisation", function() {
        const result = normalizeFileUri(
            "file:///C:/Users/me/my-app/src/main/java/com/mycompany/app/App.java",
            "win32",
        );
        assert.strictEqual(
            result.toString(),
            "file:///c:/Users/me/my-app/src/main/java/com/mycompany/app/App.java",
        );
    });
});
