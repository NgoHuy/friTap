(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load_android_hooking_agent = exports.socket_library = void 0;
const shared_structures_1 = require("../shared/shared_structures");
const shared_functions_1 = require("../shared/shared_functions");
const log_1 = require("../util/log");
const gnutls_android_1 = require("./gnutls_android");
const wolfssl_android_1 = require("./wolfssl_android");
const nss_android_1 = require("./nss_android");
const mbedTLS_android_1 = require("./mbedTLS_android");
const openssl_boringssl_android_1 = require("./openssl_boringssl_android");
const android_java_tls_libs_1 = require("./android_java_tls_libs");
var plattform_name = "Android";
var moduleNames = (0, shared_functions_1.getModuleNames)();
exports.socket_library = "libc";
function install_java_hooks() {
    (0, android_java_tls_libs_1.java_execute)();
}
function hook_Android_Dynamic_Loader(module_library_mapping) {
    try {
        const regex_libdl = /.*libdl.*\.so/;
        const libdl = moduleNames.find(element => element.match(regex_libdl));
        if (libdl === undefined) {
            throw "Android Dynamic loader not found!";
        }
        let dl_exports = Process.getModuleByName(libdl).enumerateExports();
        var dlopen = "dlopen";
        for (var ex of dl_exports) {
            if (ex.name === "android_dlopen_ext") {
                dlopen = "android_dlopen_ext";
                break;
            }
        }
        Interceptor.attach(Module.getExportByName(libdl, dlopen), {
            onEnter: function (args) {
                this.moduleName = args[0].readCString();
            },
            onLeave: function (retval) {
                if (this.moduleName != undefined) {
                    for (let map of module_library_mapping[plattform_name]) {
                        let regex = map[0];
                        let func = map[1];
                        if (regex.test(this.moduleName)) {
                            (0, log_1.log)(`${this.moduleName} was loaded & will be hooked on Android!`);
                            func(this.moduleName);
                        }
                    }
                }
            }
        });
        console.log(`[*] Android dynamic loader hooked.`);
    }
    catch (error) {
        (0, log_1.devlog)("Loader error: " + error);
        (0, log_1.log)("No dynamic loader present for hooking.");
    }
}
function hook_native_Android_SSL_Libs(module_library_mapping) {
    (0, shared_functions_1.ssl_library_loader)(plattform_name, module_library_mapping, moduleNames);
}
function load_android_hooking_agent() {
    shared_structures_1.module_library_mapping[plattform_name] = [[/.*libssl_sb.so/, openssl_boringssl_android_1.boring_execute], [/.*libssl\.so/, openssl_boringssl_android_1.boring_execute], [/.*libgnutls\.so/, gnutls_android_1.gnutls_execute], [/.*libwolfssl\.so/, wolfssl_android_1.wolfssl_execute], [/.*libnspr[0-9]?\.so/, nss_android_1.nss_execute], [/libmbedtls\.so.*/, mbedTLS_android_1.mbedTLS_execute]];
    install_java_hooks();
    hook_native_Android_SSL_Libs(shared_structures_1.module_library_mapping);
    hook_Android_Dynamic_Loader(shared_structures_1.module_library_mapping);
}
exports.load_android_hooking_agent = load_android_hooking_agent;

},{"../shared/shared_functions":20,"../shared/shared_structures":21,"../util/log":29,"./android_java_tls_libs":2,"./gnutls_android":5,"./mbedTLS_android":6,"./nss_android":7,"./openssl_boringssl_android":8,"./wolfssl_android":9}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.java_execute = exports.SSL_Java_Android = void 0;
const log_1 = require("../util/log");
const bouncycastle_1 = require("./bouncycastle");
const java_ssl_libs_1 = require("../ssl_lib/java_ssl_libs");
class SSL_Java_Android extends java_ssl_libs_1.SSL_Java {
    install_java_android_hooks() {
        if (Java.available) {
            Java.perform(function () {
                // Bouncycastle/Spongycastle
                try {
                    //If we can load a class of spongycastle, we know its present and we have to hook it
                    var testLoad = Java.use("org.spongycastle.jsse.provider.ProvSSLSocketDirect");
                    (0, log_1.log)("Bouncycastle/Spongycastle detected.");
                    (0, bouncycastle_1.execute)();
                }
                catch (error) {
                    //On error, just do nothing
                }
            });
        }
    }
    execute_hooks() {
        this.install_java_android_hooks();
        this.install_java_hooks();
    }
}
exports.SSL_Java_Android = SSL_Java_Android;
function java_execute() {
    var java_ssl = new SSL_Java_Android();
    java_ssl.execute_hooks();
}
exports.java_execute = java_execute;

},{"../ssl_lib/java_ssl_libs":23,"../util/log":29,"./bouncycastle":3}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = void 0;
const log_1 = require("../util/log");
const shared_functions_1 = require("../shared/shared_functions");
function execute() {
    Java.perform(function () {
        //Hook the inner class "AppDataOutput/input" of ProvSSLSocketDirect, so we can access the 
        //socket information in its outer class by accessing this.this$0
        var appDataOutput = Java.use("org.spongycastle.jsse.provider.ProvSSLSocketDirect$AppDataOutput");
        appDataOutput.write.overload('[B', 'int', 'int').implementation = function (buf, offset, len) {
            var result = [];
            for (var i = 0; i < len; ++i) {
                result.push(buf[i] & 0xff);
            }
            var message = {};
            message["contentType"] = "datalog";
            message["src_port"] = this.this$0.value.getLocalPort();
            message["dst_port"] = this.this$0.value.getPort();
            var localAddress = this.this$0.value.getLocalAddress().getAddress();
            var inetAddress = this.this$0.value.getInetAddress().getAddress();
            if (localAddress.length == 4) {
                message["src_addr"] = (0, shared_functions_1.byteArrayToNumber)(localAddress);
                message["dst_addr"] = (0, shared_functions_1.byteArrayToNumber)(inetAddress);
                message["ss_family"] = "AF_INET";
            }
            else {
                message["src_addr"] = (0, shared_functions_1.byteArrayToString)(localAddress);
                message["dst_addr"] = (0, shared_functions_1.byteArrayToString)(inetAddress);
                message["ss_family"] = "AF_INET6";
            }
            message["ssl_session_id"] = (0, shared_functions_1.byteArrayToString)(this.this$0.value.getConnection().getSession().getId());
            //log(message["ssl_session_id"])
            message["function"] = "writeApplicationData";
            send(message, result);
            return this.write(buf, offset, len);
        };
        var appDataInput = Java.use("org.spongycastle.jsse.provider.ProvSSLSocketDirect$AppDataInput");
        appDataInput.read.overload('[B', 'int', 'int').implementation = function (buf, offset, len) {
            var bytesRead = this.read(buf, offset, len);
            var result = [];
            for (var i = 0; i < bytesRead; ++i) {
                result.push(buf[i] & 0xff);
            }
            var message = {};
            message["contentType"] = "datalog";
            message["ss_family"] = "AF_INET";
            message["src_port"] = this.this$0.value.getPort();
            message["dst_port"] = this.this$0.value.getLocalPort();
            var localAddress = this.this$0.value.getLocalAddress().getAddress();
            var inetAddress = this.this$0.value.getInetAddress().getAddress();
            if (localAddress.length == 4) {
                message["src_addr"] = (0, shared_functions_1.byteArrayToNumber)(inetAddress);
                message["dst_addr"] = (0, shared_functions_1.byteArrayToNumber)(localAddress);
                message["ss_family"] = "AF_INET";
            }
            else {
                message["src_addr"] = (0, shared_functions_1.byteArrayToString)(inetAddress);
                message["dst_addr"] = (0, shared_functions_1.byteArrayToString)(localAddress);
                message["ss_family"] = "AF_INET6";
            }
            message["ssl_session_id"] = (0, shared_functions_1.byteArrayToString)(this.this$0.value.getConnection().getSession().getId());
            (0, log_1.log)(message["ssl_session_id"]);
            message["function"] = "readApplicationData";
            send(message, result);
            return bytesRead;
        };
        //Hook the handshake to read the client random and the master key
        var ProvSSLSocketDirect = Java.use("org.spongycastle.jsse.provider.ProvSSLSocketDirect");
        ProvSSLSocketDirect.notifyHandshakeComplete.implementation = function (x) {
            var protocol = this.protocol.value;
            var securityParameters = protocol.securityParameters.value;
            var clientRandom = securityParameters.clientRandom.value;
            var masterSecretObj = (0, shared_functions_1.getAttribute)(securityParameters, "masterSecret");
            //The key is in the AbstractTlsSecret, so we need to access the superclass to get the field
            var clazz = Java.use("java.lang.Class");
            var masterSecretRawField = Java.cast(masterSecretObj.getClass(), clazz).getSuperclass().getDeclaredField("data");
            masterSecretRawField.setAccessible(true);
            var masterSecretReflectArray = masterSecretRawField.get(masterSecretObj);
            var message = {};
            message["contentType"] = "keylog";
            message["keylog"] = "CLIENT_RANDOM " + (0, shared_functions_1.byteArrayToString)(clientRandom) + " " + (0, shared_functions_1.reflectionByteArrayToString)(masterSecretReflectArray);
            send(message);
            return this.notifyHandshakeComplete(x);
        };
    });
}
exports.execute = execute;

},{"../shared/shared_functions":20,"../util/log":29}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = void 0;
const log_1 = require("../util/log");
function findProviderInstallerFromClassloaders(currentClassLoader, backupImplementation) {
    var providerInstallerImpl = null;
    var classLoaders = Java.enumerateClassLoadersSync();
    for (var cl of classLoaders) {
        try {
            var classFactory = Java.ClassFactory.get(cl);
            providerInstallerImpl = classFactory.use("com.google.android.gms.common.security.ProviderInstallerImpl");
            break;
        }
        catch (error) {
            // On error we return null
        }
    }
    //Revert the implementation to avoid an infinitloop of "Loadclass"
    currentClassLoader.loadClass.overload("java.lang.String").implementation = backupImplementation;
    return providerInstallerImpl;
}
function execute() {
    //We have to hook multiple entrypoints: ProviderInstallerImpl and ProviderInstaller
    Java.perform(function () {
        //Part one: Hook ProviderInstallerImpl
        var javaClassLoader = Java.use("java.lang.ClassLoader");
        var backupImplementation = javaClassLoader.loadClass.overload("java.lang.String").implementation;
        //The classloader for ProviderInstallerImpl might not be present on startup, so we hook the loadClass method.  
        javaClassLoader.loadClass.overload("java.lang.String").implementation = function (className) {
            let retval = this.loadClass(className);
            if (className.endsWith("ProviderInstallerImpl")) {
                (0, log_1.log)("Process is loading ProviderInstallerImpl");
                var providerInstallerImpl = findProviderInstallerFromClassloaders(javaClassLoader, backupImplementation);
                if (providerInstallerImpl === null) {
                    (0, log_1.log)("ProviderInstallerImpl could not be found, although it has been loaded");
                }
                else {
                    providerInstallerImpl.insertProvider.implementation = function () {
                        (0, log_1.log)("ProviderinstallerImpl redirection/blocking");
                    };
                }
            }
            return retval;
        };
        //Part two: Hook Providerinstaller
        try {
            var providerInstaller = Java.use("com.google.android.gms.security.ProviderInstaller");
            providerInstaller.installIfNeeded.implementation = function (context) {
                (0, log_1.log)("Providerinstaller redirection/blocking");
            };
            providerInstaller.installIfNeededAsync.implementation = function (context, callback) {
                (0, log_1.log)("Providerinstaller redirection/blocking");
                callback.onProviderInstalled();
            };
        }
        catch (error) {
            // As it is not available, do nothing
        }
    });
}
exports.execute = execute;

},{"../util/log":29}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gnutls_execute = exports.GnuTLS_Linux = void 0;
const gnutls_1 = require("../ssl_lib/gnutls");
const android_agent_1 = require("./android_agent");
class GnuTLS_Linux extends gnutls_1.GnuTLS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        Interceptor.attach(this.addresses["gnutls_init"], {
            onEnter: function (args) {
                this.session = args[0];
            },
            onLeave: function (retval) {
                console.log(this.session);
                gnutls_1.GnuTLS.gnutls_session_set_keylog_function(this.session.readPointer(), gnutls_1.GnuTLS.keylog_callback);
            }
        });
    }
}
exports.GnuTLS_Linux = GnuTLS_Linux;
function gnutls_execute(moduleName) {
    var gnutls_ssl = new GnuTLS_Linux(moduleName, android_agent_1.socket_library);
    gnutls_ssl.execute_hooks();
}
exports.gnutls_execute = gnutls_execute;

},{"../ssl_lib/gnutls":22,"./android_agent":1}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mbedTLS_execute = exports.mbed_TLS_Android = void 0;
const mbedTLS_1 = require("../ssl_lib/mbedTLS");
const android_agent_1 = require("./android_agent");
class mbed_TLS_Android extends mbedTLS_1.mbed_TLS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    /*
    SSL_CTX_set_keylog_callback not exported by default on windows.

    We need to find a way to install the callback function for doing that

    Alternatives?:SSL_export_keying_material, SSL_SESSION_get_master_key
    */
    install_tls_keys_callback_hook() {
        // install hooking for windows
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
    }
}
exports.mbed_TLS_Android = mbed_TLS_Android;
function mbedTLS_execute(moduleName) {
    var mbedTLS_ssl = new mbed_TLS_Android(moduleName, android_agent_1.socket_library);
    mbedTLS_ssl.execute_hooks();
}
exports.mbedTLS_execute = mbedTLS_execute;

},{"../ssl_lib/mbedTLS":24,"./android_agent":1}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nss_execute = exports.NSS_Android = void 0;
const nss_1 = require("../ssl_lib/nss");
const android_agent_1 = require("./android_agent");
class NSS_Android extends nss_1.NSS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        var library_method_mapping = {};
        library_method_mapping[`*${moduleName}*`] = ["PR_Write", "PR_Read", "PR_FileDesc2NativeHandle", "PR_GetPeerName", "PR_GetSockName", "PR_GetNameForIdentity", "PR_GetDescType"];
        library_method_mapping[`*libnss*`] = ["PK11_ExtractKeyValue", "PK11_GetKeyData"];
        library_method_mapping["*libssl*.so"] = ["SSL_ImportFD", "SSL_GetSessionID", "SSL_HandshakeCallback"];
        library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        super(moduleName, socket_library, library_method_mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        //this.install_tls_keys_callback_hook() // might fail 
    }
}
exports.NSS_Android = NSS_Android;
function nss_execute(moduleName) {
    var nss_ssl = new NSS_Android(moduleName, android_agent_1.socket_library);
    nss_ssl.execute_hooks();
}
exports.nss_execute = nss_execute;

},{"../ssl_lib/nss":25,"./android_agent":1}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boring_execute = exports.OpenSSL_BoringSSL_Android = void 0;
const openssl_boringssl_1 = require("../ssl_lib/openssl_boringssl");
const android_agent_1 = require("./android_agent");
class OpenSSL_BoringSSL_Android extends openssl_boringssl_1.OpenSSL_BoringSSL {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        openssl_boringssl_1.OpenSSL_BoringSSL.SSL_CTX_set_keylog_callback = ObjC.available ? new NativeFunction(this.addresses["SSL_CTX_set_info_callback"], "void", ["pointer", "pointer"]) : new NativeFunction(this.addresses["SSL_CTX_set_keylog_callback"], "void", ["pointer", "pointer"]);
        Interceptor.attach(this.addresses["SSL_new"], {
            onEnter: function (args) {
                openssl_boringssl_1.OpenSSL_BoringSSL.SSL_CTX_set_keylog_callback(args[0], openssl_boringssl_1.OpenSSL_BoringSSL.keylog_callback);
            }
        });
    }
}
exports.OpenSSL_BoringSSL_Android = OpenSSL_BoringSSL_Android;
function boring_execute(moduleName) {
    var boring_ssl = new OpenSSL_BoringSSL_Android(moduleName, android_agent_1.socket_library);
    boring_ssl.execute_hooks();
}
exports.boring_execute = boring_execute;

},{"../ssl_lib/openssl_boringssl":26,"./android_agent":1}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wolfssl_execute = exports.WolfSSL_Android = void 0;
const wolfssl_1 = require("../ssl_lib/wolfssl");
const android_agent_1 = require("./android_agent");
const shared_functions_1 = require("../shared/shared_functions");
class WolfSSL_Android extends wolfssl_1.WolfSSL {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        wolfssl_1.WolfSSL.wolfSSL_get_client_random = new NativeFunction(this.addresses["wolfSSL_get_client_random"], "int", ["pointer", "pointer", "int"]);
        wolfssl_1.WolfSSL.wolfSSL_get_server_random = new NativeFunction(this.addresses["wolfSSL_get_server_random"], "int", ["pointer", "pointer", "int"]);
        //https://www.wolfssl.com/doxygen/group__Setup.html#gaf18a029cfeb3150bc245ce66b0a44758
        wolfssl_1.WolfSSL.wolfSSL_SESSION_get_master_key = new NativeFunction(this.addresses["wolfSSL_SESSION_get_master_key"], "int", ["pointer", "pointer", "int"]);
        Interceptor.attach(this.addresses["wolfSSL_connect"], {
            onEnter: function (args) {
                this.ssl = args[0];
            },
            onLeave: function (retval) {
                this.session = wolfssl_1.WolfSSL.wolfSSL_get_session(this.ssl);
                var keysString = "";
                //https://www.wolfssl.com/doxygen/group__Setup.html#ga927e37dc840c228532efa0aa9bbec451
                var requiredClientRandomLength = wolfssl_1.WolfSSL.wolfSSL_get_client_random(this.session, NULL, 0);
                var clientBuffer = Memory.alloc(requiredClientRandomLength);
                wolfssl_1.WolfSSL.wolfSSL_get_client_random(this.ssl, clientBuffer, requiredClientRandomLength);
                var clientBytes = clientBuffer.readByteArray(requiredClientRandomLength);
                keysString = `${keysString}CLIENT_RANDOM: ${(0, shared_functions_1.toHexString)(clientBytes)}\n`;
                //https://www.wolfssl.com/doxygen/group__Setup.html#ga987035fc600ba9e3b02e2b2718a16a6c
                var requiredServerRandomLength = wolfssl_1.WolfSSL.wolfSSL_get_server_random(this.session, NULL, 0);
                var serverBuffer = Memory.alloc(requiredServerRandomLength);
                wolfssl_1.WolfSSL.wolfSSL_get_server_random(this.ssl, serverBuffer, requiredServerRandomLength);
                var serverBytes = serverBuffer.readByteArray(requiredServerRandomLength);
                keysString = `${keysString}SERVER_RANDOM: ${(0, shared_functions_1.toHexString)(serverBytes)}\n`;
                //https://www.wolfssl.com/doxygen/group__Setup.html#gaf18a029cfeb3150bc245ce66b0a44758
                var requiredMasterKeyLength = wolfssl_1.WolfSSL.wolfSSL_SESSION_get_master_key(this.session, NULL, 0);
                var masterBuffer = Memory.alloc(requiredMasterKeyLength);
                wolfssl_1.WolfSSL.wolfSSL_SESSION_get_master_key(this.session, masterBuffer, requiredMasterKeyLength);
                var masterBytes = masterBuffer.readByteArray(requiredMasterKeyLength);
                keysString = `${keysString}MASTER_KEY: ${(0, shared_functions_1.toHexString)(masterBytes)}\n`;
                var message = {};
                message["contentType"] = "keylog";
                message["keylog"] = keysString;
                send(message);
            }
        });
    }
}
exports.WolfSSL_Android = WolfSSL_Android;
function wolfssl_execute(moduleName) {
    var wolf_ssl = new WolfSSL_Android(moduleName, android_agent_1.socket_library);
    wolf_ssl.execute_hooks();
}
exports.wolfssl_execute = wolfssl_execute;

},{"../shared/shared_functions":20,"../ssl_lib/wolfssl":27,"./android_agent":1}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load_ios_hooking_agent = exports.socket_library = void 0;
const shared_structures_1 = require("../shared/shared_structures");
const log_1 = require("../util/log");
const shared_functions_1 = require("../shared/shared_functions");
const openssl_boringssl_ios_1 = require("./openssl_boringssl_ios");
var plattform_name = "iOS";
var moduleNames = (0, shared_functions_1.getModuleNames)();
exports.socket_library = "libSystem.B.dylib";
function hook_iOS_Dynamic_Loader(module_library_mapping) {
    try {
        (0, log_1.devlog)("Missing dynamic loader hook implementation!");
    }
    catch (error) {
        (0, log_1.devlog)("Loader error: " + error);
        (0, log_1.log)("No dynamic loader present for hooking.");
    }
}
function hook_iOS_SSL_Libs(module_library_mapping) {
    (0, shared_functions_1.ssl_library_loader)(plattform_name, module_library_mapping, moduleNames);
}
function load_ios_hooking_agent() {
    shared_structures_1.module_library_mapping[plattform_name] = [[/.*libboringssl\.dylib/, openssl_boringssl_ios_1.boring_execute]];
    hook_iOS_SSL_Libs(shared_structures_1.module_library_mapping);
    hook_iOS_Dynamic_Loader(shared_structures_1.module_library_mapping);
}
exports.load_ios_hooking_agent = load_ios_hooking_agent;

},{"../shared/shared_functions":20,"../shared/shared_structures":21,"../util/log":29,"./openssl_boringssl_ios":11}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boring_execute = exports.OpenSSL_BoringSSL_iOS = void 0;
const openssl_boringssl_1 = require("../ssl_lib/openssl_boringssl");
const ios_agent_1 = require("./ios_agent");
class OpenSSL_BoringSSL_iOS extends openssl_boringssl_1.OpenSSL_BoringSSL {
    moduleName;
    socket_library;
    install_tls_keys_callback_hook() {
        console.log(this.addresses); // currently only for debugging purposes will be removed in future releases
        if (ObjC.available) { // inspired from https://codeshare.frida.re/@andydavies/ios-tls-keylogger/
            var CALLBACK_OFFSET = 0x2A8;
            var foundationNumber = Module.findExportByName('CoreFoundation', 'kCFCoreFoundationVersionNumber')?.readDouble();
            if (foundationNumber == undefined) {
                CALLBACK_OFFSET = 0x2A8;
            }
            else if (foundationNumber >= 1751.108) {
                CALLBACK_OFFSET = 0x2B8; // >= iOS 14.x 
            }
            Interceptor.attach(this.addresses["SSL_CTX_set_info_callback"], {
                onEnter: function (args) {
                    ptr(args[0]).add(CALLBACK_OFFSET).writePointer(this.keylog_callback);
                }
            });
        }
    }
    constructor(moduleName, socket_library) {
        var library_method_mapping = {};
        // the iOS implementation needs some further improvements - currently we are not able to get the sockfd from an SSL_read/write invocation
        library_method_mapping[`*${moduleName}*`] = ["SSL_read", "SSL_write", "BIO_get_fd", "SSL_get_session", "SSL_SESSION_get_id", "SSL_new", "SSL_CTX_set_info_callback"];
        library_method_mapping[`*${socket_library}*`] = ["getpeername*", "getsockname*", "ntohs*", "ntohl*"]; // currently those functions gets only identified if we at an asterisk at the end 
        super(moduleName, socket_library, library_method_mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        /*
        currently these function hooks aren't implemented
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        */
        this.install_tls_keys_callback_hook();
    }
}
exports.OpenSSL_BoringSSL_iOS = OpenSSL_BoringSSL_iOS;
function boring_execute(moduleName) {
    var boring_ssl = new OpenSSL_BoringSSL_iOS(moduleName, ios_agent_1.socket_library);
    boring_ssl.execute_hooks();
}
exports.boring_execute = boring_execute;

},{"../ssl_lib/openssl_boringssl":26,"./ios_agent":10}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gnutls_execute = exports.GnuTLS_Linux = void 0;
const gnutls_1 = require("../ssl_lib/gnutls");
const linux_agent_1 = require("./linux_agent");
class GnuTLS_Linux extends gnutls_1.GnuTLS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        Interceptor.attach(this.addresses["gnutls_init"], {
            onEnter: function (args) {
                this.session = args[0];
            },
            onLeave: function (retval) {
                console.log(this.session);
                gnutls_1.GnuTLS.gnutls_session_set_keylog_function(this.session.readPointer(), gnutls_1.GnuTLS.keylog_callback);
            }
        });
    }
}
exports.GnuTLS_Linux = GnuTLS_Linux;
function gnutls_execute(moduleName) {
    var gnutls_ssl = new GnuTLS_Linux(moduleName, linux_agent_1.socket_library);
    gnutls_ssl.execute_hooks();
}
exports.gnutls_execute = gnutls_execute;

},{"../ssl_lib/gnutls":22,"./linux_agent":13}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load_linux_hooking_agent = exports.socket_library = void 0;
const shared_structures_1 = require("../shared/shared_structures");
const log_1 = require("../util/log");
const shared_functions_1 = require("../shared/shared_functions");
const gnutls_linux_1 = require("./gnutls_linux");
const wolfssl_linux_1 = require("./wolfssl_linux");
const nss_linux_1 = require("./nss_linux");
const mbedTLS_linux_1 = require("./mbedTLS_linux");
const openssl_boringssl_linux_1 = require("./openssl_boringssl_linux");
var plattform_name = "Linux";
var moduleNames = (0, shared_functions_1.getModuleNames)();
exports.socket_library = "libc";
function hook_Linux_Dynamic_Loader(module_library_mapping) {
    try {
        const regex_libdl = /.*libdl.*\.so/;
        const libdl = moduleNames.find(element => element.match(regex_libdl));
        if (libdl === undefined) {
            throw "Linux Dynamic loader not found!";
        }
        var dlopen = "dlopen";
        Interceptor.attach(Module.getExportByName(libdl, dlopen), {
            onEnter: function (args) {
                this.moduleName = args[0].readCString();
            },
            onLeave: function (retval) {
                if (this.moduleName != undefined) {
                    for (let map of module_library_mapping[plattform_name]) {
                        let regex = map[0];
                        let func = map[1];
                        if (regex.test(this.moduleName)) {
                            (0, log_1.log)(`${this.moduleName} was loaded & will be hooked on Linux!`);
                            func(this.moduleName);
                        }
                    }
                }
            }
        });
        console.log(`[*] Linux dynamic loader hooked.`);
    }
    catch (error) {
        (0, log_1.devlog)("Loader error: " + error);
        (0, log_1.log)("No dynamic loader present for hooking.");
    }
}
function hook_Linux_SSL_Libs(module_library_mapping) {
    (0, shared_functions_1.ssl_library_loader)(plattform_name, module_library_mapping, moduleNames);
}
function load_linux_hooking_agent() {
    shared_structures_1.module_library_mapping[plattform_name] = [[/.*libssl_sb.so/, openssl_boringssl_linux_1.boring_execute], [/.*libssl\.so/, openssl_boringssl_linux_1.boring_execute], [/.*libgnutls\.so/, gnutls_linux_1.gnutls_execute], [/.*libwolfssl\.so/, wolfssl_linux_1.wolfssl_execute], [/.*libnspr[0-9]?\.so/, nss_linux_1.nss_execute], [/libmbedtls\.so.*/, mbedTLS_linux_1.mbedTLS_execute]];
    hook_Linux_SSL_Libs(shared_structures_1.module_library_mapping);
    hook_Linux_Dynamic_Loader(shared_structures_1.module_library_mapping);
}
exports.load_linux_hooking_agent = load_linux_hooking_agent;

},{"../shared/shared_functions":20,"../shared/shared_structures":21,"../util/log":29,"./gnutls_linux":12,"./mbedTLS_linux":14,"./nss_linux":15,"./openssl_boringssl_linux":16,"./wolfssl_linux":17}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mbedTLS_execute = exports.mbed_TLS_Linux = void 0;
const mbedTLS_1 = require("../ssl_lib/mbedTLS");
const linux_agent_1 = require("./linux_agent");
class mbed_TLS_Linux extends mbedTLS_1.mbed_TLS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    /*
    SSL_CTX_set_keylog_callback not exported by default on windows.

    We need to find a way to install the callback function for doing that

    Alternatives?:SSL_export_keying_material, SSL_SESSION_get_master_key
    */
    install_tls_keys_callback_hook() {
        // install hooking for windows
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
    }
}
exports.mbed_TLS_Linux = mbed_TLS_Linux;
function mbedTLS_execute(moduleName) {
    var mbedTLS_ssl = new mbed_TLS_Linux(moduleName, linux_agent_1.socket_library);
    mbedTLS_ssl.execute_hooks();
}
exports.mbedTLS_execute = mbedTLS_execute;

},{"../ssl_lib/mbedTLS":24,"./linux_agent":13}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nss_execute = exports.NSS_Linux = void 0;
const nss_1 = require("../ssl_lib/nss");
const linux_agent_1 = require("./linux_agent");
const log_1 = require("../util/log");
class NSS_Linux extends nss_1.NSS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        var library_method_mapping = {};
        library_method_mapping[`*${moduleName}*`] = ["PR_Write", "PR_Read", "PR_FileDesc2NativeHandle", "PR_GetPeerName", "PR_GetSockName", "PR_GetNameForIdentity", "PR_GetDescType"];
        library_method_mapping[`*libnss*`] = ["PK11_ExtractKeyValue", "PK11_GetKeyData"];
        library_method_mapping["*libssl*.so"] = ["SSL_ImportFD", "SSL_GetSessionID", "SSL_HandshakeCallback"];
        library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        super(moduleName, socket_library, library_method_mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        nss_1.NSS.getDescType = new NativeFunction(this.addresses['PR_GetDescType'], "int", ["pointer"]);
        // SSL Handshake Functions:
        nss_1.NSS.PR_GetNameForIdentity = new NativeFunction(this.addresses['PR_GetNameForIdentity'], "pointer", ["pointer"]);
        /*
                SECStatus SSL_HandshakeCallback(PRFileDesc *fd, SSLHandshakeCallback cb, void *client_data);
                more at https://developer.mozilla.org/en-US/docs/Mozilla/Projects/NSS/SSL_functions/sslfnc#1112702
        */
        nss_1.NSS.get_SSL_Callback = new NativeFunction(this.addresses["SSL_HandshakeCallback"], "int", ["pointer", "pointer", "pointer"]);
        // SSL Key helper Functions 
        nss_1.NSS.PK11_ExtractKeyValue = new NativeFunction(this.addresses["PK11_ExtractKeyValue"], "int", ["pointer"]);
        nss_1.NSS.PK11_GetKeyData = new NativeFunction(this.addresses["PK11_GetKeyData"], "pointer", ["pointer"]);
        Interceptor.attach(this.addresses["SSL_ImportFD"], {
            onEnter(args) {
                this.fd = args[1];
            },
            onLeave(retval) {
                if (retval.isNull()) {
                    (0, log_1.devlog)("[-] SSL_ImportFD error: unknow null");
                    return;
                }
                var retValue = nss_1.NSS.get_SSL_Callback(retval, nss_1.NSS.keylog_callback, NULL);
                nss_1.NSS.register_secret_callback(retval);
                // typedef enum { PR_FAILURE = -1, PR_SUCCESS = 0 } PRStatus;
                if (retValue < 0) {
                    (0, log_1.devlog)("Callback Error");
                    var getErrorText = new NativeFunction(Module.getExportByName('libnspr4.so', 'PR_GetErrorText'), "int", ["pointer"]);
                    var outbuffer = Memory.alloc(200); // max out size
                    console.log("typeof outbuffer: " + typeof outbuffer);
                    console.log("outbuffer: " + outbuffer); // should be a pointer
                    getErrorText(outbuffer.readPointer());
                    (0, log_1.devlog)("Error msg: " + outbuffer);
                }
                else {
                    (0, log_1.devlog)("[*] keylog callback successfull installed");
                }
            }
        });
        /*
            SECStatus SSL_HandshakeCallback(
                PRFileDesc *fd,
                SSLHandshakeCallback cb,
                void *client_data
            );
         */
        Interceptor.attach(this.addresses["SSL_HandshakeCallback"], {
            onEnter(args) {
                this.originalCallback = args[1];
                Interceptor.attach(ptr(this.originalCallback), {
                    onEnter(args) {
                        var sslSocketFD = args[0];
                        (0, log_1.devlog)("[*] keylog callback successfull installed via applications callback function");
                        nss_1.NSS.ssl_RecordKeyLog(sslSocketFD);
                    },
                    onLeave(retval) {
                    }
                });
            },
            onLeave(retval) {
            }
        });
    }
}
exports.NSS_Linux = NSS_Linux;
function nss_execute(moduleName) {
    var nss_ssl = new NSS_Linux(moduleName, linux_agent_1.socket_library);
    nss_ssl.execute_hooks();
}
exports.nss_execute = nss_execute;

},{"../ssl_lib/nss":25,"../util/log":29,"./linux_agent":13}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boring_execute = exports.OpenSSL_BoringSSL_Linux = void 0;
const openssl_boringssl_1 = require("../ssl_lib/openssl_boringssl");
const linux_agent_1 = require("./linux_agent");
class OpenSSL_BoringSSL_Linux extends openssl_boringssl_1.OpenSSL_BoringSSL {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        openssl_boringssl_1.OpenSSL_BoringSSL.SSL_CTX_set_keylog_callback = ObjC.available ? new NativeFunction(this.addresses["SSL_CTX_set_info_callback"], "void", ["pointer", "pointer"]) : new NativeFunction(this.addresses["SSL_CTX_set_keylog_callback"], "void", ["pointer", "pointer"]);
        Interceptor.attach(this.addresses["SSL_new"], {
            onEnter: function (args) {
                openssl_boringssl_1.OpenSSL_BoringSSL.SSL_CTX_set_keylog_callback(args[0], openssl_boringssl_1.OpenSSL_BoringSSL.keylog_callback);
            }
        });
    }
}
exports.OpenSSL_BoringSSL_Linux = OpenSSL_BoringSSL_Linux;
function boring_execute(moduleName) {
    var boring_ssl = new OpenSSL_BoringSSL_Linux(moduleName, linux_agent_1.socket_library);
    boring_ssl.execute_hooks();
}
exports.boring_execute = boring_execute;

},{"../ssl_lib/openssl_boringssl":26,"./linux_agent":13}],17:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wolfssl_execute = exports.WolfSSL_Linux = void 0;
const wolfssl_1 = require("../ssl_lib/wolfssl");
const linux_agent_1 = require("./linux_agent");
const shared_functions_1 = require("../shared/shared_functions");
class WolfSSL_Linux extends wolfssl_1.WolfSSL {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        wolfssl_1.WolfSSL.wolfSSL_get_client_random = new NativeFunction(this.addresses["wolfSSL_get_client_random"], "int", ["pointer", "pointer", "int"]);
        wolfssl_1.WolfSSL.wolfSSL_get_server_random = new NativeFunction(this.addresses["wolfSSL_get_server_random"], "int", ["pointer", "pointer", "int"]);
        //https://www.wolfssl.com/doxygen/group__Setup.html#gaf18a029cfeb3150bc245ce66b0a44758
        wolfssl_1.WolfSSL.wolfSSL_SESSION_get_master_key = new NativeFunction(this.addresses["wolfSSL_SESSION_get_master_key"], "int", ["pointer", "pointer", "int"]);
        Interceptor.attach(this.addresses["wolfSSL_connect"], {
            onEnter: function (args) {
                this.ssl = args[0];
            },
            onLeave: function (retval) {
                this.session = wolfssl_1.WolfSSL.wolfSSL_get_session(this.ssl);
                var keysString = "";
                //https://www.wolfssl.com/doxygen/group__Setup.html#ga927e37dc840c228532efa0aa9bbec451
                var requiredClientRandomLength = wolfssl_1.WolfSSL.wolfSSL_get_client_random(this.session, NULL, 0);
                var clientBuffer = Memory.alloc(requiredClientRandomLength);
                wolfssl_1.WolfSSL.wolfSSL_get_client_random(this.ssl, clientBuffer, requiredClientRandomLength);
                var clientBytes = clientBuffer.readByteArray(requiredClientRandomLength);
                keysString = `${keysString}CLIENT_RANDOM: ${(0, shared_functions_1.toHexString)(clientBytes)}\n`;
                //https://www.wolfssl.com/doxygen/group__Setup.html#ga987035fc600ba9e3b02e2b2718a16a6c
                var requiredServerRandomLength = wolfssl_1.WolfSSL.wolfSSL_get_server_random(this.session, NULL, 0);
                var serverBuffer = Memory.alloc(requiredServerRandomLength);
                wolfssl_1.WolfSSL.wolfSSL_get_server_random(this.ssl, serverBuffer, requiredServerRandomLength);
                var serverBytes = serverBuffer.readByteArray(requiredServerRandomLength);
                keysString = `${keysString}SERVER_RANDOM: ${(0, shared_functions_1.toHexString)(serverBytes)}\n`;
                //https://www.wolfssl.com/doxygen/group__Setup.html#gaf18a029cfeb3150bc245ce66b0a44758
                var requiredMasterKeyLength = wolfssl_1.WolfSSL.wolfSSL_SESSION_get_master_key(this.session, NULL, 0);
                var masterBuffer = Memory.alloc(requiredMasterKeyLength);
                wolfssl_1.WolfSSL.wolfSSL_SESSION_get_master_key(this.session, masterBuffer, requiredMasterKeyLength);
                var masterBytes = masterBuffer.readByteArray(requiredMasterKeyLength);
                keysString = `${keysString}MASTER_KEY: ${(0, shared_functions_1.toHexString)(masterBytes)}\n`;
                var message = {};
                message["contentType"] = "keylog";
                message["keylog"] = keysString;
                send(message);
            }
        });
    }
}
exports.WolfSSL_Linux = WolfSSL_Linux;
function wolfssl_execute(moduleName) {
    var wolf_ssl = new WolfSSL_Linux(moduleName, linux_agent_1.socket_library);
    wolf_ssl.execute_hooks();
}
exports.wolfssl_execute = wolfssl_execute;

},{"../shared/shared_functions":20,"../ssl_lib/wolfssl":27,"./linux_agent":13}],18:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load_macos_hooking_agent = exports.socket_library = void 0;
const shared_structures_1 = require("../shared/shared_structures");
const log_1 = require("../util/log");
const shared_functions_1 = require("../shared/shared_functions");
const openssl_boringssl_macos_1 = require("./openssl_boringssl_macos");
var plattform_name = "MacOS";
var moduleNames = (0, shared_functions_1.getModuleNames)();
exports.socket_library = "libSystem.B.dylib";
function hook_macOS_Dynamic_Loader(module_library_mapping) {
    try {
        (0, log_1.devlog)("Missing dynamic loader hook implementation!");
    }
    catch (error) {
        (0, log_1.devlog)("Loader error: " + error);
        (0, log_1.log)("No dynamic loader present for hooking.");
    }
}
function hook_macOS_SSL_Libs(module_library_mapping) {
    (0, shared_functions_1.ssl_library_loader)(plattform_name, module_library_mapping, moduleNames);
}
function load_macos_hooking_agent() {
    shared_structures_1.module_library_mapping[plattform_name] = [[/.*libboringssl\.dylib/, openssl_boringssl_macos_1.boring_execute]];
    hook_macOS_SSL_Libs(shared_structures_1.module_library_mapping); // actually we are using the same implementation as we did on iOS, therefore this needs addtional testing
    hook_macOS_Dynamic_Loader(shared_structures_1.module_library_mapping);
}
exports.load_macos_hooking_agent = load_macos_hooking_agent;

},{"../shared/shared_functions":20,"../shared/shared_structures":21,"../util/log":29,"./openssl_boringssl_macos":19}],19:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boring_execute = exports.OpenSSL_BoringSSL_MacOS = void 0;
const openssl_boringssl_1 = require("../ssl_lib/openssl_boringssl");
const macos_agent_1 = require("./macos_agent");
class OpenSSL_BoringSSL_MacOS extends openssl_boringssl_1.OpenSSL_BoringSSL {
    moduleName;
    socket_library;
    install_tls_keys_callback_hook() {
        console.log(this.addresses); // currently only for debugging purposes will be removed in future releases
        if (ObjC.available) { // inspired from https://codeshare.frida.re/@andydavies/ios-tls-keylogger/
            var CALLBACK_OFFSET = 0x2A8;
            var foundationNumber = Module.findExportByName('CoreFoundation', 'kCFCoreFoundationVersionNumber')?.readDouble();
            if (foundationNumber == undefined) {
                CALLBACK_OFFSET = 0x2A8;
            }
            else if (foundationNumber >= 1751.108) {
                CALLBACK_OFFSET = 0x2B8; // >= iOS 14.x 
            }
            Interceptor.attach(this.addresses["SSL_CTX_set_info_callback"], {
                onEnter: function (args) {
                    ptr(args[0]).add(CALLBACK_OFFSET).writePointer(this.keylog_callback);
                }
            });
        }
    }
    constructor(moduleName, socket_library) {
        var library_method_mapping = {};
        // the iOS implementation needs some further improvements - currently we are not able to get the sockfd from an SSL_read/write invocation
        library_method_mapping[`*${moduleName}*`] = ["SSL_read", "SSL_write", "BIO_get_fd", "SSL_get_session", "SSL_SESSION_get_id", "SSL_new", "SSL_CTX_set_info_callback"];
        library_method_mapping[`*${socket_library}*`] = ["getpeername*", "getsockname*", "ntohs*", "ntohl*"]; // currently those functions gets only identified if we at an asterisk at the end 
        super(moduleName, socket_library, library_method_mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        /*
        currently these function hooks aren't implemented
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        */
        this.install_tls_keys_callback_hook();
    }
}
exports.OpenSSL_BoringSSL_MacOS = OpenSSL_BoringSSL_MacOS;
function boring_execute(moduleName) {
    var boring_ssl = new OpenSSL_BoringSSL_MacOS(moduleName, macos_agent_1.socket_library);
    boring_ssl.execute_hooks();
}
exports.boring_execute = boring_execute;

},{"../ssl_lib/openssl_boringssl":26,"./macos_agent":18}],20:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttribute = exports.byteArrayToNumber = exports.reflectionByteArrayToString = exports.toHexString = exports.byteArrayToString = exports.getPortsAndAddresses = exports.getBaseAddress = exports.readAddresses = exports.getModuleNames = exports.getSocketLibrary = exports.ssl_library_loader = void 0;
const log_1 = require("../util/log");
const shared_structures_1 = require("./shared_structures");
/**
 * This file contains methods which are shared for reading
 * secrets/data from different libraries. These methods are
 * indipendent from the implementation of ssl/tls, but they depend
 * on libc.
 */
function ssl_library_loader(plattform_name, module_library_mapping, moduleNames) {
    for (let map of module_library_mapping[plattform_name]) {
        let regex = map[0];
        let func = map[1];
        for (let module of moduleNames) {
            if (regex.test(module)) {
                try {
                    (0, log_1.log)(`${module} found & will be hooked on ${plattform_name}!`);
                    func(module); // on some Android Apps we encounterd the problem of multiple SSL libraries but only one is used for the SSL encryption/decryption
                }
                catch (error) {
                    (0, log_1.log)(`error: skipping module ${module}`);
                    // when we enable the logging of devlogs we can print the error message as well for further improving this part
                    (0, log_1.devlog)("Loader error: " + error);
                    //  {'description': 'Could not find *libssl*.so!SSL_ImportFD', 'type': 'error'}
                }
            }
        }
    }
}
exports.ssl_library_loader = ssl_library_loader;
//TODO: 
function getSocketLibrary() {
    var moduleNames = getModuleNames();
    var socket_library_name = "";
    switch (Process.platform) {
        case "linux":
            return moduleNames.find(element => element.match(/libc.*\.so/));
        case "windows":
            return "WS2_32.dll";
        case "darwin":
            return "libSystem.B.dylib";
            //TODO: improve it with regular expressions. libboringssl.dylib
            break;
        default:
            (0, log_1.log)(`Platform "${Process.platform} currently not supported!`);
            return "";
    }
}
exports.getSocketLibrary = getSocketLibrary;
function getModuleNames() {
    var moduleNames = [];
    Process.enumerateModules().forEach(item => moduleNames.push(item.name));
    return moduleNames;
}
exports.getModuleNames = getModuleNames;
/**
 * Read the addresses for the given methods from the given modules
 * @param {{[key: string]: Array<String> }} library_method_mapping A string indexed list of arrays, mapping modules to methods
 * @return {{[key: string]: NativePointer }} A string indexed list of NativePointers, which point to the respective methods
 */
function readAddresses(library_method_mapping) {
    var resolver = new ApiResolver("module");
    var addresses = {};
    for (let library_name in library_method_mapping) {
        library_method_mapping[library_name].forEach(function (method) {
            var matches = resolver.enumerateMatches("exports:" + library_name + "!" + method);
            var match_number = 0;
            var method_name = method.toString();
            if (method_name.endsWith("*")) { // this is for the temporary iOS bug using fridas ApiResolver
                method_name = method_name.substring(0, method_name.length - 1);
            }
            if (matches.length == 0) {
                throw "Could not find " + library_name + "!" + method;
            }
            else if (matches.length == 1) {
                (0, log_1.devlog)("Found " + method + " " + matches[0].address);
            }
            else {
                // Sometimes Frida returns duplicates or it finds more than one result.
                for (var k = 0; k < matches.length; k++) {
                    if (matches[k].name.endsWith(method_name)) {
                        match_number = k;
                        (0, log_1.devlog)("Found " + method + " " + matches[match_number].address);
                        break;
                    }
                }
            }
            addresses[method_name] = matches[match_number].address;
        });
    }
    return addresses;
}
exports.readAddresses = readAddresses;
/**
 * Returns the base address of a given module
 * @param {string} moduleName Name of module to return base address from
 * @returns
 */
function getBaseAddress(moduleName) {
    console.log("Module to find:", moduleName);
    const modules = Process.enumerateModules();
    for (const module of modules) {
        if (module.name == moduleName) {
            return module.base;
        }
    }
    return null;
}
exports.getBaseAddress = getBaseAddress;
/**
* Returns a dictionary of a sockfd's "src_addr", "src_port", "dst_addr", and
* "dst_port".
* @param {int} sockfd The file descriptor of the socket to inspect.
* @param {boolean} isRead If true, the context is an SSL_read call. If
*     false, the context is an SSL_write call.
* @param {{ [key: string]: NativePointer}} methodAddresses Dictionary containing (at least) addresses for getpeername, getsockname, ntohs and ntohl
* @return {{ [key: string]: string | number }} Dictionary of sockfd's "src_addr", "src_port", "dst_addr",
*     and "dst_port".
*/
function getPortsAndAddresses(sockfd, isRead, methodAddresses) {
    var getpeername = new NativeFunction(methodAddresses["getpeername"], "int", ["int", "pointer", "pointer"]);
    var getsockname = new NativeFunction(methodAddresses["getsockname"], "int", ["int", "pointer", "pointer"]);
    var ntohs = new NativeFunction(methodAddresses["ntohs"], "uint16", ["uint16"]);
    var ntohl = new NativeFunction(methodAddresses["ntohl"], "uint32", ["uint32"]);
    var message = {};
    var addrlen = Memory.alloc(4);
    var addr = Memory.alloc(128);
    var src_dst = ["src", "dst"];
    for (var i = 0; i < src_dst.length; i++) {
        addrlen.writeU32(128);
        if ((src_dst[i] == "src") !== isRead) {
            getsockname(sockfd, addr, addrlen);
        }
        else {
            getpeername(sockfd, addr, addrlen);
        }
        if (addr.readU16() == shared_structures_1.AF_INET) {
            message[src_dst[i] + "_port"] = ntohs(addr.add(2).readU16());
            message[src_dst[i] + "_addr"] = ntohl(addr.add(4).readU32());
            message["ss_family"] = "AF_INET";
        }
        else if (addr.readU16() == shared_structures_1.AF_INET6) {
            message[src_dst[i] + "_port"] = ntohs(addr.add(2).readU16());
            message[src_dst[i] + "_addr"] = "";
            var ipv6_addr = addr.add(8);
            for (var offset = 0; offset < 16; offset += 1) {
                message[src_dst[i] + "_addr"] += ("0" + ipv6_addr.add(offset).readU8().toString(16).toUpperCase()).substr(-2);
            }
            if (message[src_dst[i] + "_addr"].toString().indexOf("00000000000000000000FFFF") === 0) {
                message[src_dst[i] + "_addr"] = ntohl(ipv6_addr.add(12).readU32());
                message["ss_family"] = "AF_INET";
            }
            else {
                message["ss_family"] = "AF_INET6";
            }
        }
        else {
            throw "Only supporting IPv4/6";
        }
    }
    return message;
}
exports.getPortsAndAddresses = getPortsAndAddresses;
/**
 * Convert a Java byte array to string
 * @param byteArray The array to convert
 * @returns {string} The resulting string
 */
function byteArrayToString(byteArray) {
    return Array.from(byteArray, function (byte) {
        return ('0' + (byte & 0xFF).toString(16)).slice(-2);
    }).join('');
}
exports.byteArrayToString = byteArrayToString;
function toHexString(byteArray) {
    const byteToHex = [];
    for (let n = 0; n <= 0xff; ++n) {
        const hexOctet = n.toString(16).padStart(2, "0");
        byteToHex.push(hexOctet);
    }
    return Array.prototype.map.call(new Uint8Array(byteArray), n => byteToHex[n]).join("");
}
exports.toHexString = toHexString;
/**
 * Convert a Java Reflection array to string
 * @param byteArray The array to convert
 * @returns {string} The resulting string
 */
function reflectionByteArrayToString(byteArray) {
    var result = "";
    var arrayReflect = Java.use("java.lang.reflect.Array");
    for (var i = 0; i < arrayReflect.getLength(byteArray); i++) {
        result += ('0' + (arrayReflect.get(byteArray, i) & 0xFF).toString(16)).slice(-2);
    }
    return result;
}
exports.reflectionByteArrayToString = reflectionByteArrayToString;
/**
 * Convert a Java byte arry to number (Big Endian)
 * @param byteArray The array to convert
 * @returns {number} The resulting number
 */
function byteArrayToNumber(byteArray) {
    var value = 0;
    for (var i = 0; i < byteArray.length; i++) {
        value = (value * 256) + (byteArray[i] & 0xFF);
    }
    return value;
}
exports.byteArrayToNumber = byteArrayToNumber;
/**
 * Access an attribute of a Java Class
 * @param Instance The instace you want to access
 * @param fieldName The name of the attribute
 * @returns The value of the attribute of the requested field
 */
function getAttribute(Instance, fieldName) {
    var clazz = Java.use("java.lang.Class");
    var field = Java.cast(Instance.getClass(), clazz).getDeclaredField(fieldName);
    field.setAccessible(true);
    return field.get(Instance);
}
exports.getAttribute = getAttribute;

},{"../util/log":29,"./shared_structures":21}],21:[function(require,module,exports){
"use strict";
/* In this file we store global variables and structures */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointerSize = exports.AF_INET6 = exports.AF_INET = exports.module_library_mapping = void 0;
exports.module_library_mapping = {};
exports.AF_INET = 2;
exports.AF_INET6 = 10;
exports.pointerSize = Process.pointerSize;

},{}],22:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GnuTLS = void 0;
const shared_functions_1 = require("../shared/shared_functions");
class GnuTLS {
    moduleName;
    socket_library;
    passed_library_method_mapping;
    // global variables
    library_method_mapping = {};
    addresses;
    static gnutls_transport_get_int;
    static gnutls_session_get_id;
    static gnutls_session_get_random;
    static gnutls_session_set_keylog_function;
    constructor(moduleName, socket_library, passed_library_method_mapping) {
        this.moduleName = moduleName;
        this.socket_library = socket_library;
        this.passed_library_method_mapping = passed_library_method_mapping;
        if (typeof passed_library_method_mapping !== 'undefined') {
            this.library_method_mapping = passed_library_method_mapping;
        }
        else {
            this.library_method_mapping[`*${moduleName}*`] = ["gnutls_record_recv", "gnutls_record_send", "gnutls_session_set_keylog_function", "gnutls_transport_get_int", "gnutls_session_get_id", "gnutls_init", "gnutls_handshake", "gnutls_session_get_keylog_function", "gnutls_session_get_random"];
            this.library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        }
        this.addresses = (0, shared_functions_1.readAddresses)(this.library_method_mapping);
        GnuTLS.gnutls_transport_get_int = new NativeFunction(this.addresses["gnutls_transport_get_int"], "int", ["pointer"]);
        GnuTLS.gnutls_session_get_id = new NativeFunction(this.addresses["gnutls_session_get_id"], "int", ["pointer", "pointer", "pointer"]);
        GnuTLS.gnutls_session_set_keylog_function = new NativeFunction(this.addresses["gnutls_session_set_keylog_function"], "void", ["pointer", "pointer"]);
        GnuTLS.gnutls_session_get_random = new NativeFunction(this.addresses["gnutls_session_get_random"], "pointer", ["pointer", "pointer", "pointer"]);
    }
    //NativeCallback
    static keylog_callback = new NativeCallback(function (session, label, secret) {
        var message = {};
        message["contentType"] = "keylog";
        var secret_len = secret.add(Process.pointerSize).readUInt();
        var secret_str = "";
        var p = secret.readPointer();
        for (var i = 0; i < secret_len; i++) {
            // Read a byte, convert it to a hex string (0xAB ==> "AB"), and append
            // it to secret_str.
            secret_str +=
                ("0" + p.add(i).readU8().toString(16).toUpperCase()).substr(-2);
        }
        var server_random_ptr = Memory.alloc(Process.pointerSize + 4);
        var client_random_ptr = Memory.alloc(Process.pointerSize + 4);
        if (typeof this !== "undefined") {
            GnuTLS.gnutls_session_get_random(session, client_random_ptr, server_random_ptr);
        }
        else {
            console.log("[-] Error while installing keylog callback");
        }
        var client_random_str = "";
        var client_random_len = 32;
        p = client_random_ptr.readPointer();
        for (i = 0; i < client_random_len; i++) {
            // Read a byte, convert it to a hex string (0xAB ==> "AB"), and append
            // it to client_random_str.
            client_random_str +=
                ("0" + p.add(i).readU8().toString(16).toUpperCase()).substr(-2);
        }
        message["keylog"] = label.readCString() + " " + client_random_str + " " + secret_str;
        send(message);
        return 0;
    }, "int", ["pointer", "pointer", "pointer"]);
    /**
       * Get the session_id of SSL object and return it as a hex string.
       * @param {!NativePointer} ssl A pointer to an SSL object.
       * @return {dict} A string representing the session_id of the SSL object's
       *     SSL_SESSION. For example,
       *     "59FD71B7B90202F359D89E66AE4E61247954E28431F6C6AC46625D472FF76336".
       */
    static getSslSessionId(session) {
        var len_pointer = Memory.alloc(4);
        var err = GnuTLS.gnutls_session_get_id(session, NULL, len_pointer);
        if (err != 0) {
            return "";
        }
        var len = len_pointer.readU32();
        var p = Memory.alloc(len);
        err = GnuTLS.gnutls_session_get_id(session, p, len_pointer);
        if (err != 0) {
            return "";
        }
        var session_id = "";
        for (var i = 0; i < len; i++) {
            // Read a byte, convert it to a hex string (0xAB ==> "AB"), and append
            // it to session_id.
            session_id +=
                ("0" + p.add(i).readU8().toString(16).toUpperCase()).substr(-2);
        }
        return session_id;
    }
    install_plaintext_read_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["gnutls_record_recv"], {
            onEnter: function (args) {
                var message = (0, shared_functions_1.getPortsAndAddresses)(GnuTLS.gnutls_transport_get_int(args[0]), true, lib_addesses);
                message["ssl_session_id"] = GnuTLS.getSslSessionId(args[0]);
                message["function"] = "SSL_read";
                this.message = message;
                this.buf = args[1];
            },
            onLeave: function (retval) {
                retval |= 0; // Cast retval to 32-bit integer.
                if (retval <= 0) {
                    return;
                }
                this.message["contentType"] = "datalog";
                send(this.message, this.buf.readByteArray(retval));
            }
        });
    }
    install_plaintext_write_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["gnutls_record_send"], {
            onEnter: function (args) {
                var message = (0, shared_functions_1.getPortsAndAddresses)(GnuTLS.gnutls_transport_get_int(args[0]), false, lib_addesses);
                message["ssl_session_id"] = GnuTLS.getSslSessionId(args[0]);
                message["function"] = "SSL_write";
                message["contentType"] = "datalog";
                send(message, args[1].readByteArray(parseInt(args[2])));
            },
            onLeave: function (retval) {
            }
        });
    }
    install_tls_keys_callback_hook() {
    }
}
exports.GnuTLS = GnuTLS;

},{"../shared/shared_functions":20}],23:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSL_Java = void 0;
const log_1 = require("../util/log");
const conscrypt_1 = require("../android/conscrypt");
class SSL_Java {
    install_java_hooks() {
        if (Java.available) {
            Java.perform(function () {
                //Conscrypt needs early instrumentation as we block the provider installation
                var Security = Java.use("java.security.Security");
                if (Security.getProviders().toString().includes("GmsCore_OpenSSL")) {
                    (0, log_1.log)("WARNING: PID " + Process.id + " Detected GmsCore_OpenSSL Provider. This can be a bit unstable. If you having issues, rerun with -spawn for early instrumentation. Trying to remove it to fall back on default Provider");
                    Security.removeProvider("GmsCore_OpenSSL");
                    (0, log_1.log)("Removed GmsCore_OpenSSL");
                }
                //As the classloader responsible for loading ProviderInstaller sometimes is not present from the beginning on,
                //we always have to watch the classloader activity
                (0, conscrypt_1.execute)();
                //Now do the same for Ssl_guard
                if (Security.getProviders().toString().includes("Ssl_Guard")) {
                    (0, log_1.log)("Ssl_Guard deteced, removing it to fall back on default Provider");
                    Security.removeProvider("Ssl_Guard");
                    (0, log_1.log)("Removed Ssl_Guard");
                }
                //Same thing for Conscrypt provider which has been manually inserted (not by providerinstaller)
                if (Security.getProviders().toString().includes("Conscrypt version")) {
                    (0, log_1.log)("Conscrypt detected");
                    Security.removeProvider("Conscrypt");
                    (0, log_1.log)("Removed Conscrypt");
                }
                //Uncomment this line to show all remaining providers
                //log("Remaining: " + Security.getProviders().toString())
                //Hook insertProviderAt/addprovider for dynamic provider blocking
                Security.insertProviderAt.implementation = function (provider, position) {
                    if (provider.getName().includes("Conscrypt") || provider.getName().includes("Ssl_Guard") || provider.getName().includes("GmsCore_OpenSSL")) {
                        (0, log_1.log)("Blocking provider registration of " + provider.getName());
                        return position;
                    }
                    else {
                        return this.insertProviderAt(provider, position);
                    }
                };
                //Same for addProvider
                Security.insertProviderAt.implementation = function (provider) {
                    if (provider.getName().includes("Conscrypt") || provider.getName().includes("Ssl_Guard") || provider.getName().includes("GmsCore_OpenSSL")) {
                        (0, log_1.log)("Blocking provider registration of " + provider.getName());
                        return 1;
                    }
                    else {
                        return this.addProvider(provider);
                    }
                };
            });
        }
    }
}
exports.SSL_Java = SSL_Java;

},{"../android/conscrypt":4,"../util/log":29}],24:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mbed_TLS = void 0;
const shared_functions_1 = require("../shared/shared_functions");
class mbed_TLS {
    moduleName;
    socket_library;
    passed_library_method_mapping;
    // global variables
    library_method_mapping = {};
    addresses;
    constructor(moduleName, socket_library, passed_library_method_mapping) {
        this.moduleName = moduleName;
        this.socket_library = socket_library;
        this.passed_library_method_mapping = passed_library_method_mapping;
        if (typeof passed_library_method_mapping !== 'undefined') {
            this.library_method_mapping = passed_library_method_mapping;
        }
        else {
            this.library_method_mapping[`*${moduleName}*`] = ["mbedtls_ssl_read", "mbedtls_ssl_write"];
            this.library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        }
        this.addresses = (0, shared_functions_1.readAddresses)(this.library_method_mapping);
    }
    static parse_mbedtls_ssl_context_struct(sslcontext) {
        return {
            conf: sslcontext.readPointer(),
            state: sslcontext.add(Process.pointerSize).readS32(),
            renego_status: sslcontext.add(Process.pointerSize + 4).readS32(),
            renego_records_seen: sslcontext.add(Process.pointerSize + 4 + 4).readS32(),
            major_ver: sslcontext.add(Process.pointerSize + 4 + 4 + 4).readS32(),
            minor_ver: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4).readS32(),
            badmac_seen: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4 + 4).readU32(),
            f_send: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4 + 4 + 4).readPointer(),
            f_recv: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4 + 4 + 4 + Process.pointerSize).readPointer(),
            f_recv_timeout: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4 + 4 + 4 + 2 * Process.pointerSize).readPointer(),
            p_bio: sslcontext.add(Process.platform == 'windows' ? 48 : 56).readPointer(),
            session_in: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4 + 4 + 4 + 4 * Process.pointerSize).readPointer(),
            session_out: sslcontext.add(Process.pointerSize + 4 + 4 + 4 + 4 + 4 + 4 + 5 * Process.pointerSize).readPointer(),
            session: {
                start: sslcontext.add(24 + 7 * Process.pointerSize).readPointer().readPointer(),
                ciphersuite: sslcontext.add(24 + 7 * Process.pointerSize).readPointer().add(8).readS32(),
                compression: sslcontext.add(24 + 7 * Process.pointerSize).readPointer().add(8 + 4).readS32(),
                id_len: sslcontext.add(24 + 7 * Process.pointerSize).readPointer().add(8 + 4 + 4).readU32(),
                id: sslcontext.add(24 + 7 * Process.pointerSize).readPointer().add(8 + 4 + 4 + 4).readByteArray(sslcontext.add(24 + 7 * Process.pointerSize).readPointer().add(8 + 4 + 4).readU32())
            }
        };
    }
    static getSocketDescriptor(sslcontext) {
        var ssl_context = mbed_TLS.parse_mbedtls_ssl_context_struct(sslcontext);
        return ssl_context.p_bio.readS32();
    }
    static getSessionId(sslcontext) {
        var ssl_context = mbed_TLS.parse_mbedtls_ssl_context_struct(sslcontext);
        var session_id = '';
        for (var byteCounter = 0; byteCounter < ssl_context.session.id_len; byteCounter++) {
            session_id = `${session_id}${ssl_context.session.id?.unwrap().add(byteCounter).readU8().toString(16).toUpperCase()}`;
        }
        return session_id;
    }
    install_plaintext_read_hook() {
        var lib_addesses = this.addresses;
        //https://tls.mbed.org/api/ssl_8h.html#aa2c29eeb1deaf5ad9f01a7515006ede5
        Interceptor.attach(this.addresses["mbedtls_ssl_read"], {
            onEnter: function (args) {
                this.buffer = args[1];
                this.len = args[2];
                this.sslContext = args[0];
                var message = (0, shared_functions_1.getPortsAndAddresses)(mbed_TLS.getSocketDescriptor(args[0]), true, lib_addesses);
                message["ssl_session_id"] = mbed_TLS.getSessionId(args[0]);
                message["function"] = "mbedtls_ssl_read";
                this.message = message;
            },
            onLeave: function (retval) {
                retval |= 0; // Cast retval to 32-bit integer.
                if (retval <= 0) {
                    return;
                }
                var data = this.buffer.readByteArray(retval);
                this.message["contentType"] = "datalog";
                send(this.message, data);
            }
        });
    }
    install_plaintext_write_hook() {
        var lib_addesses = this.addresses;
        //https://tls.mbed.org/api/ssl_8h.html#a5bbda87d484de82df730758b475f32e5
        Interceptor.attach(this.addresses["mbedtls_ssl_write"], {
            onEnter: function (args) {
                var buffer = args[1];
                var len = args[2];
                len |= 0; // Cast retval to 32-bit integer.
                if (len <= 0) {
                    return;
                }
                var data = buffer.readByteArray(len);
                var message = (0, shared_functions_1.getPortsAndAddresses)(mbed_TLS.getSocketDescriptor(args[0]), false, lib_addesses);
                message["ssl_session_id"] = mbed_TLS.getSessionId(args[0]);
                message["function"] = "mbedtls_ssl_write";
                message["contentType"] = "datalog";
                send(message, data);
            }
        });
    }
    install_tls_keys_callback_hook() {
        // TBD
    }
}
exports.mbed_TLS = mbed_TLS;

},{"../shared/shared_functions":20}],25:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NSS = exports.PRDescType = exports.SECStatus = void 0;
const shared_functions_1 = require("../shared/shared_functions");
const shared_structures_1 = require("../shared/shared_structures");
const log_1 = require("../util/log");
const { readU32, readU64, readPointer, writeU32, writeU64, writePointer } = NativePointer.prototype;
// https://developer.mozilla.org/en-US/docs/Mozilla/Projects/NSS/SSL_functions/ssltyp#1026722
var SECStatus;
(function (SECStatus) {
    SECStatus[SECStatus["SECWouldBlock"] = -2] = "SECWouldBlock";
    SECStatus[SECStatus["SECFailure"] = -1] = "SECFailure";
    SECStatus[SECStatus["SECSuccess"] = 0] = "SECSuccess";
})(SECStatus = exports.SECStatus || (exports.SECStatus = {}));
;
var PRDescType;
(function (PRDescType) {
    PRDescType[PRDescType["PR_DESC_FILE"] = 1] = "PR_DESC_FILE";
    PRDescType[PRDescType["PR_DESC_SOCKET_TCP"] = 2] = "PR_DESC_SOCKET_TCP";
    PRDescType[PRDescType["PR_DESC_SOCKET_UDP"] = 3] = "PR_DESC_SOCKET_UDP";
    PRDescType[PRDescType["PR_DESC_LAYERED"] = 4] = "PR_DESC_LAYERED";
    PRDescType[PRDescType["PR_DESC_PIPE"] = 5] = "PR_DESC_PIPE";
})(PRDescType = exports.PRDescType || (exports.PRDescType = {}));
PRDescType;
class NSS {
    moduleName;
    socket_library;
    passed_library_method_mapping;
    // global definitions
    static doTLS13_RTT0 = -1;
    static SSL3_RANDOM_LENGTH = 32;
    // global variables
    library_method_mapping = {};
    addresses;
    static SSL_SESSION_get_id;
    static getsockname;
    static getpeername;
    static getDescType;
    static PR_GetNameForIdentity;
    static get_SSL_Callback;
    static PK11_ExtractKeyValue;
    static PK11_GetKeyData;
    constructor(moduleName, socket_library, passed_library_method_mapping) {
        this.moduleName = moduleName;
        this.socket_library = socket_library;
        this.passed_library_method_mapping = passed_library_method_mapping;
        if (typeof passed_library_method_mapping !== 'undefined') {
            this.library_method_mapping = passed_library_method_mapping;
        }
        else {
            this.library_method_mapping[`*${moduleName}*`] = ["PR_Write", "PR_Read", "PR_FileDesc2NativeHandle", "PR_GetPeerName", "PR_GetSockName", "PR_GetNameForIdentity", "PR_GetDescType"];
            this.library_method_mapping[`*libnss*`] = ["PK11_ExtractKeyValue", "PK11_GetKeyData"];
            this.library_method_mapping["*libssl*.so"] = ["SSL_ImportFD", "SSL_GetSessionID", "SSL_HandshakeCallback"];
            this.library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        }
        this.addresses = (0, shared_functions_1.readAddresses)(this.library_method_mapping);
        NSS.SSL_SESSION_get_id = new NativeFunction(this.addresses["SSL_GetSessionID"], "pointer", ["pointer"]);
        NSS.getsockname = new NativeFunction(this.addresses["PR_GetSockName"], "int", ["pointer", "pointer"]);
        NSS.getpeername = new NativeFunction(this.addresses["PR_GetPeerName"], "int", ["pointer", "pointer"]);
    }
    /* PARSING functions */
    static parse_struct_SECItem(secitem) {
        /*
         * struct SECItemStr {
         * SECItemType type;
         * unsigned char *data;
         * unsigned int len;
         * }; --> size = 20
        */
        return {
            "type": secitem.readU64(),
            "data": secitem.add(shared_structures_1.pointerSize).readPointer(),
            "len": secitem.add(shared_structures_1.pointerSize * 2).readU32()
        };
    }
    // https://github.com/nss-dev/nss/blob/master/lib/ssl/sslimpl.h#L971
    static parse_struct_sslSocketStr(sslSocketFD) {
        return {
            "fd": sslSocketFD.readPointer(),
            "version": sslSocketFD.add(160),
            "handshakeCallback": sslSocketFD.add(464),
            "secretCallback": sslSocketFD.add(568),
            "ssl3": sslSocketFD.add(1432)
        };
    }
    // https://github.com/nss-dev/nss/blob/master/lib/ssl/sslimpl.h#L771
    static parse_struct_ssl3Str(ssl3_struct) {
        /*
        struct ssl3StateStr {
    
        ssl3CipherSpec *crSpec; // current read spec.
        ssl3CipherSpec *prSpec; // pending read spec.
        ssl3CipherSpec *cwSpec; // current write spec.
        ssl3CipherSpec *pwSpec; // pending write spec.
        
        PRBool peerRequestedKeyUpdate;                     --> enum type
        
        PRBool keyUpdateDeferred;                          --> enum type
        tls13KeyUpdateRequest deferredKeyUpdateRequest;    --> enum type
       
        PRBool clientCertRequested;                        --> enum type
    
        CERTCertificate *clientCertificate;
        SECKEYPrivateKey *clientPrivateKey;
        CERTCertificateList *clientCertChain;
        PRBool sendEmptyCert;
    
        PRUint8 policy;
        PLArenaPool *peerCertArena;
        
        void *peerCertChain;
        
        CERTDistNames *ca_list;
        
        SSL3HandshakeState hs;
        ...
        }
        */
        return {
            "crSpec": ssl3_struct.readPointer(),
            "prSpec": ssl3_struct.add(shared_structures_1.pointerSize).readPointer(),
            "cwSpec": ssl3_struct.add(shared_structures_1.pointerSize * 2).readPointer(),
            "pwSpec": ssl3_struct.add(shared_structures_1.pointerSize * 3).readPointer(),
            "peerRequestedKeyUpdate": ssl3_struct.add(shared_structures_1.pointerSize * 4).readU32(),
            "keyUpdateDeferred": ssl3_struct.add(shared_structures_1.pointerSize * 4 + 4).readU32(),
            "deferredKeyUpdateRequest": ssl3_struct.add(shared_structures_1.pointerSize * 4 + 8).readU32(),
            "clientCertRequested": ssl3_struct.add(shared_structures_1.pointerSize * 4 + 12).readU32(),
            "clientCertificate": ssl3_struct.add(shared_structures_1.pointerSize * 4 + 16).readPointer(),
            "clientPrivateKey": ssl3_struct.add(shared_structures_1.pointerSize * 5 + 16).readPointer(),
            "clientCertChain": ssl3_struct.add(shared_structures_1.pointerSize * 6 + 16).readPointer(),
            "sendEmptyCert": ssl3_struct.add(shared_structures_1.pointerSize * 7 + 16).readU32(),
            "policy": ssl3_struct.add(shared_structures_1.pointerSize * 7 + 20).readU32(),
            "peerCertArena": ssl3_struct.add(shared_structures_1.pointerSize * 7 + 24).readPointer(),
            "peerCertChain": ssl3_struct.add(shared_structures_1.pointerSize * 8 + 24).readPointer(),
            "ca_list": ssl3_struct.add(shared_structures_1.pointerSize * 9 + 24).readPointer(),
            "hs": {
                "server_random": ssl3_struct.add(shared_structures_1.pointerSize * 10 + 24),
                "client_random": ssl3_struct.add(shared_structures_1.pointerSize * 10 + 56),
                "client_inner_random": ssl3_struct.add(shared_structures_1.pointerSize * 10 + 88),
                "ws": ssl3_struct.add(shared_structures_1.pointerSize * 10 + 120).readU32(),
                "hashType": ssl3_struct.add(shared_structures_1.pointerSize * 10 + 124).readU32(),
                "messages": {
                    "data": ssl3_struct.add(shared_structures_1.pointerSize * 10 + 128).readPointer(),
                    "len": ssl3_struct.add(shared_structures_1.pointerSize * 11 + 128).readU32(),
                    "space": ssl3_struct.add(shared_structures_1.pointerSize * 11 + 132).readU32(),
                    "fixed": ssl3_struct.add(shared_structures_1.pointerSize * 11 + 136).readU32(),
                },
                "echInnerMessages": {
                    "data": ssl3_struct.add(shared_structures_1.pointerSize * 11 + 140).readPointer(),
                    "len": ssl3_struct.add(shared_structures_1.pointerSize * 12 + 140).readU32(),
                    "space": ssl3_struct.add(shared_structures_1.pointerSize * 12 + 144).readU32(),
                    "fixed": ssl3_struct.add(shared_structures_1.pointerSize * 12 + 148).readU32(),
                },
                "md5": ssl3_struct.add(shared_structures_1.pointerSize * 12 + 152).readPointer(),
                "sha": ssl3_struct.add(shared_structures_1.pointerSize * 13 + 152).readPointer(),
                "shaEchInner": ssl3_struct.add(shared_structures_1.pointerSize * 14 + 152).readPointer(),
                "shaPostHandshake": ssl3_struct.add(shared_structures_1.pointerSize * 15 + 152).readPointer(),
                "signatureScheme": ssl3_struct.add(shared_structures_1.pointerSize * 16 + 152).readU32(),
                "kea_def": ssl3_struct.add(shared_structures_1.pointerSize * 16 + 156).readPointer(),
                "cipher_suite": ssl3_struct.add(shared_structures_1.pointerSize * 17 + 156).readU32(),
                "suite_def": ssl3_struct.add(shared_structures_1.pointerSize * 17 + 160).readPointer(),
                "msg_body": {
                    "data": ssl3_struct.add(shared_structures_1.pointerSize * 18 + 160).readPointer(),
                    "len": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 160).readU32(),
                    "space": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 164).readU32(),
                    "fixed": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 168).readU32(),
                },
                "header_bytes": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 172).readU32(),
                "msg_type": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 176).readU32(),
                "msg_len": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 180).readU32(),
                "isResuming": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 184).readU32(),
                "sendingSCSV": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 188).readU32(),
                "receivedNewSessionTicket": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 192).readU32(),
                "newSessionTicket": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 196),
                "finishedBytes": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 240).readU32(),
                "finishedMsgs": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 244),
                "authCertificatePending": ssl3_struct.add(shared_structures_1.pointerSize * 18 + 316).readU32(),
                "restartTarget": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 320).readU32(),
                "canFalseStart": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 324).readU32(),
                "preliminaryInfo": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 328).readU32(),
                "remoteExtensions": {
                    "next": ssl3_struct.add(shared_structures_1.pointerSize * 19 + 332).readPointer(),
                    "prev": ssl3_struct.add(shared_structures_1.pointerSize * 20 + 332).readPointer(),
                },
                "echOuterExtensions": {
                    "next": ssl3_struct.add(shared_structures_1.pointerSize * 21 + 332).readPointer(),
                    "prev": ssl3_struct.add(shared_structures_1.pointerSize * 22 + 332).readPointer(),
                },
                "sendMessageSeq": ssl3_struct.add(shared_structures_1.pointerSize * 23 + 332).readU32(),
                "lastMessageFlight": {
                    "next": ssl3_struct.add(shared_structures_1.pointerSize * 23 + 336).readPointer(),
                    "prev": ssl3_struct.add(shared_structures_1.pointerSize * 24 + 336).readPointer(),
                },
                "maxMessageSent": ssl3_struct.add(shared_structures_1.pointerSize * 25 + 336).readU16(),
                "recvMessageSeq": ssl3_struct.add(shared_structures_1.pointerSize * 25 + 338).readU16(),
                "recvdFragments": {
                    "data": ssl3_struct.add(shared_structures_1.pointerSize * 25 + 340).readPointer(),
                    "len": ssl3_struct.add(shared_structures_1.pointerSize * 26 + 340).readU32(),
                    "space": ssl3_struct.add(shared_structures_1.pointerSize * 26 + 344).readU32(),
                    "fixed": ssl3_struct.add(shared_structures_1.pointerSize * 26 + 348).readU32(),
                },
                "recvdHighWater": ssl3_struct.add(shared_structures_1.pointerSize * 26 + 352).readU32(),
                "cookie": {
                    "type": ssl3_struct.add(shared_structures_1.pointerSize * 26 + 356).readU64(),
                    "data": ssl3_struct.add(shared_structures_1.pointerSize * 27 + 356).readPointer(),
                    "len": ssl3_struct.add(shared_structures_1.pointerSize * 28 + 356).readU32(),
                },
                "times_array": ssl3_struct.add(shared_structures_1.pointerSize * 28 + 360).readU32(),
                "rtTimer": ssl3_struct.add(shared_structures_1.pointerSize * 28 + 432).readPointer(),
                "ackTimer": ssl3_struct.add(shared_structures_1.pointerSize * 29 + 432).readPointer(),
                "hdTimer": ssl3_struct.add(shared_structures_1.pointerSize * 30 + 432).readPointer(),
                "rtRetries": ssl3_struct.add(shared_structures_1.pointerSize * 31 + 432).readU32(),
                "srvVirtName": {
                    "type": ssl3_struct.add(shared_structures_1.pointerSize * 31 + 436).readU64(),
                    "data": ssl3_struct.add(shared_structures_1.pointerSize * 32 + 436).readPointer(),
                    "len": ssl3_struct.add(shared_structures_1.pointerSize * 33 + 436).readU32(),
                },
                "currentSecret": ssl3_struct.add(shared_structures_1.pointerSize * 33 + 440).readPointer(),
                "resumptionMasterSecret": ssl3_struct.add(shared_structures_1.pointerSize * 34 + 440).readPointer(),
                "dheSecret": ssl3_struct.add(shared_structures_1.pointerSize * 35 + 440).readPointer(),
                "clientEarlyTrafficSecret": ssl3_struct.add(shared_structures_1.pointerSize * 36 + 440).readPointer(),
                "clientHsTrafficSecret": ssl3_struct.add(shared_structures_1.pointerSize * 37 + 440).readPointer(),
                "serverHsTrafficSecret": ssl3_struct.add(shared_structures_1.pointerSize * 38 + 440).readPointer(),
                "clientTrafficSecret": ssl3_struct.add(shared_structures_1.pointerSize * 39 + 440).readPointer(),
                "serverTrafficSecret": ssl3_struct.add(shared_structures_1.pointerSize * 40 + 440).readPointer(),
                "earlyExporterSecret": ssl3_struct.add(shared_structures_1.pointerSize * 41 + 440).readPointer(),
                "exporterSecret": ssl3_struct.add(shared_structures_1.pointerSize * 42 + 440).readPointer()
            } // end of hs struct
            /*
            typedef struct SSL3HandshakeStateStr {
        SSL3Random server_random;
        SSL3Random client_random;
        SSL3Random client_inner_random;
        SSL3WaitState ws;                       --> enum type
    
        
        SSL3HandshakeHashType hashType;         --> enum type
        sslBuffer messages;                     --> struct of 20 bytes (1 ptr + 12 bytes;see lib/ssl/sslencode.h)
        sslBuffer echInnerMessages;
        
        PK11Context *md5;
        PK11Context *sha;
        PK11Context *shaEchInner;
        PK11Context *shaPostHandshake;
        SSLSignatureScheme signatureScheme;     --> enum type( see lib/ssl/sslt.h)
        const ssl3KEADef *kea_def;
        ssl3CipherSuite cipher_suite;           --> typedef PRUint16 ssl3CipherSuite (see lib/ssl/ssl3prot.h)
        const ssl3CipherSuiteDef *suite_def;
        sslBuffer msg_body;
                            
        unsigned int header_bytes;
        
        SSLHandshakeType msg_type;
        unsigned long msg_len;
        PRBool isResuming;
        PRBool sendingSCSV;
    
        
        PRBool receivedNewSessionTicket;
        NewSessionTicket newSessionTicket;      --> (see lib/ssl/ssl3prot.h)
    
        PRUint16 finishedBytes;
        union {
            TLSFinished tFinished[2];           --> 12 bytes
            SSL3Finished sFinished[2];          --> 36 bytes
            PRUint8 data[72];
        } finishedMsgs;                         --> 72
    
        PRBool authCertificatePending;
        
        sslRestartTarget restartTarget;
    
        PRBool canFalseStart;
        
        PRUint32 preliminaryInfo;
    
        
        PRCList remoteExtensions;
        PRCList echOuterExtensions;
    
        
        PRUint16 sendMessageSeq;
        PRCList lastMessageFlight;
        PRUint16 maxMessageSent;
        PRUint16 recvMessageSeq;
        sslBuffer recvdFragments;
        PRInt32 recvdHighWater;
        SECItem cookie;
        dtlsTimer timers[3];       24 * 3
        dtlsTimer *rtTimer;
        dtlsTimer *ackTimer;
        dtlsTimer *hdTimer;
        PRUint32 rtRetries;
        SECItem srvVirtName;
                                        
    
        // This group of values is used for TLS 1.3 and above
        PK11SymKey *currentSecret;            // The secret down the "left hand side"   --> ssl3_struct.add(704)
                                                //of the TLS 1.3 key schedule.
        PK11SymKey *resumptionMasterSecret;   // The resumption_master_secret.          --> ssl3_struct.add(712)
        PK11SymKey *dheSecret;                // The (EC)DHE shared secret.             --> ssl3_struct.add(720)
        PK11SymKey *clientEarlyTrafficSecret; // The secret we use for 0-RTT.           --> ssl3_struct.add(728)
        PK11SymKey *clientHsTrafficSecret;    // The source keys for handshake          --> ssl3_struct.add(736)
        PK11SymKey *serverHsTrafficSecret;    // traffic keys.                          --> ssl3_struct.add(744)
        PK11SymKey *clientTrafficSecret;      // The source keys for application        --> ssl3_struct.add(752)
        PK11SymKey *serverTrafficSecret;      // traffic keys                           --> ssl3_struct.add(760)
        PK11SymKey *earlyExporterSecret;      // for 0-RTT exporters                    --> ssl3_struct.add(768)
        PK11SymKey *exporterSecret;           // for exporters                          --> ssl3_struct.add(776)
        ...
    
    
        typedef struct {
        const char *label; 8
        DTLSTimerCb cb; 8
        PRIntervalTime started; 4
        PRUint32 timeout; 4
    } dtlsTimer;
    
            */
        };
    }
    // https://github.com/nss-dev/nss/blob/master/lib/ssl/sslspec.h#L140 
    static parse_struct_sl3CipherSpecStr(cwSpec) {
        /*
        truct ssl3CipherSpecStr {
            PRCList link;
            PRUint8 refCt;
    
            SSLSecretDirection direction;
            SSL3ProtocolVersion version;
            SSL3ProtocolVersion recordVersion;
    
            const ssl3BulkCipherDef *cipherDef;
            const ssl3MACDef *macDef;
    
            SSLCipher cipher;
            void *cipherContext;
    
            PK11SymKey *masterSecret;
            ...
        */
        return {
            "link": cwSpec.add,
            "refCt": cwSpec.add(shared_structures_1.pointerSize * 2),
            "direction": cwSpec.add(shared_structures_1.pointerSize * 2 + 4),
            "version": cwSpec.add(shared_structures_1.pointerSize * 2 + 8),
            "recordVersion": cwSpec.add(shared_structures_1.pointerSize * 2 + 12),
            "cipherDef": cwSpec.add(shared_structures_1.pointerSize * 2 + 16).readPointer(),
            "macDef": cwSpec.add(shared_structures_1.pointerSize * 3 + 16).readPointer(),
            "cipher": cwSpec.add(shared_structures_1.pointerSize * 4 + 16),
            "cipherContext": cwSpec.add(shared_structures_1.pointerSize * 4 + 24).readPointer(),
            "master_secret": cwSpec.add(shared_structures_1.pointerSize * 5 + 24).readPointer()
        };
    }
    /********* NSS Callbacks ************/
    /*
    This callback gets called whenever a SSL Handshake completed
    
    typedef void (*SSLHandshakeCallback)(
            PRFileDesc *fd,
            void *client_data);
    */
    static keylog_callback = new NativeCallback(function (sslSocketFD, client_data) {
        if (typeof this !== "undefined") {
            NSS.ssl_RecordKeyLog(sslSocketFD);
        }
        else {
            console.log("[-] Error while installing ssl_RecordKeyLog() callback");
        }
        return 0;
    }, "void", ["pointer", "pointer"]);
    /**
     * SSL_SetSecretCallback installs a callback that TLS calls when it installs new
     * traffic secrets.
     *
     *
     *
     * SSLSecretCallback is called with the current epoch and the corresponding
     * secret; this matches the epoch used in DTLS 1.3, even if the socket is
     * operating in stream mode:
     *
     * - client_early_traffic_secret corresponds to epoch 1
     * - {client|server}_handshake_traffic_secret is epoch 2
     * - {client|server}_application_traffic_secret_{N} is epoch 3+N
     *
     * The callback is invoked separately for read secrets (client secrets on the
     * server; server secrets on the client), and write secrets.
     *
     * This callback is only called if (D)TLS 1.3 is negotiated.
     *
     * typedef void(PR_CALLBACK *SSLSecretCallback)(
     *   PRFileDesc *fd, PRUint16 epoch, SSLSecretDirection dir, PK11SymKey *secret,
     *   void *arg);
     *
     *  More: https://github.com/nss-dev/nss/blob/master/lib/ssl/sslexp.h#L614
     *
     */
    static secret_callback = new NativeCallback(function (sslSocketFD, epoch, dir, secret, arg_ptr) {
        if (typeof this !== "undefined") {
            NSS.parse_epoch_value_from_SSL_SetSecretCallback(sslSocketFD, epoch);
        }
        else {
            console.log("[-] Error while installing parse_epoch_value_from_SSL_SetSecretCallback()");
        }
        return;
    }, "void", ["pointer", "uint16", "uint16", "pointer", "pointer"]);
    /********* NSS helper functions  ********/
    /**
* Returns a dictionary of a sockfd's "src_addr", "src_port", "dst_addr", and
* "dst_port".
* @param {pointer} sockfd The file descriptor of the socket to inspect as PRFileDesc.
* @param {boolean} isRead If true, the context is an SSL_read call. If
*     false, the context is an SSL_write call.
* @param {{ [key: string]: NativePointer}} methodAddresses Dictionary containing (at least) addresses for getpeername, getsockname, ntohs and ntohl
* @return {{ [key: string]: string | number }} Dictionary of sockfd's "src_addr", "src_port", "dst_addr",
*     and "dst_port".

  PRStatus PR_GetPeerName(
PRFileDesc *fd,
PRNetAddr *addr);

PRStatus PR_GetSockName(
PRFileDesc *fd,
PRNetAddr *addr);

PRStatus PR_NetAddrToString(
const PRNetAddr *addr,
char *string,
PRUint32 size);


union PRNetAddr {
struct {
   PRUint16 family;
   char data[14];
} raw;
struct {
   PRUint16 family;
   PRUint16 port;
   PRUint32 ip;
   char pad[8];
} inet;
#if defined(_PR_INET6)
struct {
   PRUint16 family;
   PRUint16 port;
   PRUint32 flowinfo;
   PRIPv6Addr ip;
} ipv6;
#endif // defined(_PR_INET6)
};

typedef union PRNetAddr PRNetAddr;

*/
    static getPortsAndAddressesFromNSS(sockfd, isRead, methodAddresses) {
        var getpeername = new NativeFunction(methodAddresses["PR_GetPeerName"], "int", ["pointer", "pointer"]);
        var getsockname = new NativeFunction(methodAddresses["PR_GetSockName"], "int", ["pointer", "pointer"]);
        var ntohs = new NativeFunction(methodAddresses["ntohs"], "uint16", ["uint16"]);
        var ntohl = new NativeFunction(methodAddresses["ntohl"], "uint32", ["uint32"]);
        var message = {};
        var addrType = Memory.alloc(2); // PRUint16 is a 2 byte (16 bit) value on all plattforms
        //var prNetAddr = Memory.alloc(Process.pointerSize)
        var addrlen = Memory.alloc(4);
        var addr = Memory.alloc(128);
        var src_dst = ["src", "dst"];
        for (var i = 0; i < src_dst.length; i++) {
            addrlen.writeU32(128);
            if ((src_dst[i] == "src") !== isRead) {
                getsockname(sockfd, addr);
            }
            else {
                getpeername(sockfd, addr);
            }
            if (addr.readU16() == shared_structures_1.AF_INET) {
                message[src_dst[i] + "_port"] = ntohs(addr.add(2).readU16());
                message[src_dst[i] + "_addr"] = ntohl(addr.add(4).readU32());
                message["ss_family"] = "AF_INET";
            }
            else if (addr.readU16() == shared_structures_1.AF_INET6) {
                message[src_dst[i] + "_port"] = ntohs(addr.add(2).readU16());
                message[src_dst[i] + "_addr"] = "";
                var ipv6_addr = addr.add(8);
                for (var offset = 0; offset < 16; offset += 1) {
                    message[src_dst[i] + "_addr"] += ("0" + ipv6_addr.add(offset).readU8().toString(16).toUpperCase()).substr(-2);
                }
                if (message[src_dst[i] + "_addr"].toString().indexOf("00000000000000000000FFFF") === 0) {
                    message[src_dst[i] + "_addr"] = ntohl(ipv6_addr.add(12).readU32());
                    message["ss_family"] = "AF_INET";
                }
                else {
                    message["ss_family"] = "AF_INET6";
                }
            }
            else {
                (0, log_1.devlog)("[-] PIPE descriptor error");
                //FIXME: Sometimes addr.readU16() will be 0 when a PIPE Read oder Write gets interpcepted, thus this error will be thrown.
                throw "Only supporting IPv4/6";
            }
        }
        return message;
    }
    /**
    * This functions tests if a given address is a readable pointer
    *
    * @param {*} ptr_addr is a pointer to the memory location where we want to check if there is already an address
    * @returns 1 to indicate that there is a ptr at
    */
    static is_ptr_at_mem_location(ptr_addr) {
        try {
            // an exception is thrown if there isn't a readable address
            ptr_addr.readPointer();
            return 1;
        }
        catch (error) {
            return -1;
        }
    }
    /**
    *
    * typedef struct PRFileDesc {
    *       const struct PRIOMethods *methods;
    *       PRFilePrivate *secret;
    *       PRFileDesc *lower;
    *       PRFileDesc *higher;
    *       void (*dtor) (PRFileDesc *);
    *       PRDescIdentity identity;
    *  } PRFileDesc;
    *
    * @param {*} pRFileDesc
    * @param {*} layer_name
    * @returns
    */
    static NSS_FindIdentityForName(pRFileDesc, layer_name) {
        var lower_ptr = pRFileDesc.add(shared_structures_1.pointerSize * 2).readPointer();
        var higher_ptr = pRFileDesc.add(shared_structures_1.pointerSize * 3).readPointer();
        var identity = pRFileDesc.add(shared_structures_1.pointerSize * 5).readPointer();
        if (!identity.isNull()) {
            var nameptr = NSS.PR_GetNameForIdentity(identity).readCString();
            if (nameptr == layer_name) {
                return pRFileDesc;
            }
        }
        if (!lower_ptr.isNull()) {
            return this.NSS_FindIdentityForName(lower_ptr, layer_name);
        }
        if (!higher_ptr.isNull()) {
            (0, log_1.devlog)('Have upper');
        }
        // when we reach this we have some sort of error 
        (0, log_1.devlog)("[-] error while getting SSL layer");
        return NULL;
    }
    static getSessionIdString(session_id_ptr, len) {
        var session_id = "";
        for (var i = 0; i < len; i++) {
            // Read a byte, convert it to a hex string (0xAB ==> "AB"), and append
            // it to session_id.
            session_id +=
                ("0" + session_id_ptr.add(i).readU8().toString(16).toUpperCase()).substr(-2);
        }
        return session_id;
    }
    static getSSL_Layer(pRFileDesc) {
        var ssl_layer_id = 3; // SSL has the Layer ID 3 normally.
        var getIdentitiesLayer = new NativeFunction(Module.getExportByName('libnspr4.so', 'PR_GetIdentitiesLayer'), "pointer", ["pointer", "int"]);
        var ssl_layer = getIdentitiesLayer(pRFileDesc, ssl_layer_id);
        if (ptr(ssl_layer.toString()).isNull()) {
            (0, log_1.devlog)("PR_BAD_DESCRIPTOR_ERROR: " + ssl_layer);
            return -1;
        }
        return ssl_layer;
    }
    /**
    *
    * @param {*} readAddr is the address where we start reading the bytes
    * @param {*} len is the length of bytes we want to convert to a hex string
    * @returns a hex string with the length of len
    */
    static getHexString(readAddr, len) {
        var secret_str = "";
        for (var i = 0; i < len; i++) {
            // Read a byte, convert it to a hex string (0xab ==> "ab"), and append
            // it to secret_str.
            secret_str +=
                ("0" + readAddr.add(i).readU8().toString(16).toLowerCase()).substr(-2);
        }
        return secret_str;
    }
    /**
 * Get the session_id of SSL object and return it as a hex string.
 * @param {!NativePointer} ssl A pointer to an SSL object.
 * @return {dict} A string representing the session_id of the SSL object's
 *     SSL_SESSION. For example,
 *     "59FD71B7B90202F359D89E66AE4E61247954E28431F6C6AC46625D472FF76336".
 *
 * On NSS the return type of SSL_GetSessionID is a SECItem:
      typedef enum {
 * siBuffer = 0,
 * siClearDataBuffer = 1,
 * siCipherDataBuffer = 2,
 * siDERCertBuffer = 3,
 * siEncodedCertBuffer = 4,
 * siDERNameBuffer = 5,
 * siEncodedNameBuffer = 6,
 * siAsciiNameString = 7,
 * siAsciiString = 8,
 * siDEROID = 9,
 * siUnsignedInteger = 10,
 * siUTCTime = 11,
 * siGeneralizedTime = 12,
 * siVisibleString = 13,
 * siUTF8String = 14,
 * siBMPString = 15
 * } SECItemType;
 *
 * typedef struct SECItemStr SECItem;
 *
 * struct SECItemStr {
 * SECItemType type;
 * unsigned char *data;
 * unsigned int len;
 * }; --> size = 20
 *
 *
 */
    static getSslSessionIdFromFD(pRFileDesc) {
        var dummySSL_SessionID = "3E8ABF58649A1A1C58824D704173BA9AAFA2DA33B45FFEA341D218B29BBACF8F";
        var fdType = NSS.getDescType(pRFileDesc);
        //log("pRFileDescType: "+ fdType)
        /*if(fdType == 4){ // LAYERED
            pRFileDesc = ptr(getSSL_Layer(pRFileDesc).toString())
            if(pRFileDesc.toString() == "-1"){
                log("error")
        
            }
        }*/
        var layer = NSS.NSS_FindIdentityForName(pRFileDesc, 'SSL');
        if (!layer) {
            return dummySSL_SessionID;
        }
        var sslSessionIdSECItem = ptr(NSS.SSL_SESSION_get_id(layer).toString());
        if (sslSessionIdSECItem == null || sslSessionIdSECItem.isNull()) {
            try {
                (0, log_1.devlog)("---- getSslSessionIdFromFD -----");
                (0, log_1.devlog)("ERROR");
                (0, log_1.devlog)("pRFileDescType: " + NSS.getDescType(pRFileDesc));
                if (fdType == 2) {
                    var c = Memory.dup(pRFileDesc, 32);
                    //log(hexdump(c))
                    var getLayersIdentity = new NativeFunction(Module.getExportByName('libnspr4.so', 'PR_GetLayersIdentity'), "uint32", ["pointer"]);
                    var getNameOfIdentityLayer = new NativeFunction(Module.getExportByName('libnspr4.so', 'PR_GetNameForIdentity'), "pointer", ["uint32"]);
                    var layerID = getLayersIdentity(pRFileDesc);
                    (0, log_1.devlog)("LayerID: " + layerID);
                    var nameIDentity = getNameOfIdentityLayer(layerID);
                    (0, log_1.devlog)("name address: " + nameIDentity);
                    (0, log_1.devlog)("name: " + ptr(nameIDentity.toString()).readCString());
                    var sslSessionIdSECItem2 = ptr(NSS.getSSL_Layer(pRFileDesc).toString());
                    (0, log_1.devlog)("sslSessionIdSECItem2 =" + sslSessionIdSECItem2);
                    if (sslSessionIdSECItem2.toString().startsWith("0x7f")) {
                        var aa = Memory.dup(sslSessionIdSECItem2, 32);
                        //log(hexdump(aa))
                        var sslSessionIdSECItem3 = ptr(NSS.SSL_SESSION_get_id(sslSessionIdSECItem2).toString());
                        (0, log_1.devlog)("sslSessionIdSECItem3 =" + sslSessionIdSECItem3);
                    }
                    var sslSessionIdSECItem4 = ptr(NSS.SSL_SESSION_get_id(pRFileDesc).toString());
                    (0, log_1.devlog)("sslSessionIdSECItem4 =" + sslSessionIdSECItem4);
                    (0, log_1.devlog)("Using Dummy Session ID");
                    (0, log_1.devlog)("");
                }
                else if (fdType == 4) {
                    pRFileDesc = ptr(NSS.getSSL_Layer(pRFileDesc).toString());
                    var sslSessionIdSECItem = ptr(NSS.SSL_SESSION_get_id(pRFileDesc).toString());
                    (0, log_1.devlog)("new sessionid_ITEM: " + sslSessionIdSECItem);
                }
                else {
                    (0, log_1.devlog)("---- SSL Session Analysis ------------");
                    var c = Memory.dup(sslSessionIdSECItem, 32);
                    (0, log_1.devlog)(hexdump(c));
                }
                (0, log_1.devlog)("---- getSslSessionIdFromFD finished -----");
                (0, log_1.devlog)("");
            }
            catch (error) {
                (0, log_1.devlog)("Error:" + error);
            }
            return dummySSL_SessionID;
        }
        var len = sslSessionIdSECItem.add(shared_structures_1.pointerSize * 2).readU32();
        var session_id_ptr = sslSessionIdSECItem.add(shared_structures_1.pointerSize).readPointer();
        var session_id = NSS.getSessionIdString(session_id_ptr, len);
        return session_id;
    }
    static get_SSL_FD(pRFileDesc) {
        var ssl_layer = NSS.NSS_FindIdentityForName(pRFileDesc, 'SSL');
        if (!ssl_layer) {
            (0, log_1.devlog)("error: couldn't get SSL Layer from pRFileDesc");
            return NULL;
        }
        var sslSocketFD = NSS.get_SSL_Socket(ssl_layer);
        if (!sslSocketFD) {
            (0, log_1.devlog)("error: couldn't get sslSocketFD");
            return NULL;
        }
        return sslSocketFD;
    }
    /**
    *
    *
    *
    *
    *
    *
    * /* This function tries to find the SSL layer in the stack.
    * It searches for the first SSL layer at or below the argument fd,
    * and failing that, it searches for the nearest SSL layer above the
    * argument fd.  It returns the private sslSocket from the found layer.
    *
    sslSocket *
    ssl_FindSocket(PRFileDesc *fd)
    {
    PRFileDesc *layer;
    sslSocket *ss;
    
    PORT_Assert(fd != NULL);
    PORT_Assert(ssl_layer_id != 0);
    
    layer = PR_GetIdentitiesLayer(fd, ssl_layer_id);
    if (layer == NULL) {
    PORT_SetError(PR_BAD_DESCRIPTOR_ERROR);
    return NULL;
    }
    
    ss = (sslSocket *)layer->secret;
    /* Set ss->fd lazily. We can't rely on the value of ss->fd set by
    * ssl_PushIOLayer because another PR_PushIOLayer call will switch the
    * contents of the PRFileDesc pointed by ss->fd and the new layer.
    * See bug 807250.
    *
    ss->fd = layer;
    return ss;
    }
    
    *
    *
    */
    static get_SSL_Socket(ssl_layer) {
        var sslSocket = ssl_layer.add(shared_structures_1.pointerSize * 1).readPointer();
        return sslSocket;
    }
    /******** NSS Encryption Keys *******/
    /**
     *
     * ss->ssl3.cwSpec->masterSecret
     *
     * @param {*} ssl3  the parsed ssl3 struct
     * @returns the client_random as hex string (lower case)
     */
    static getMasterSecret(ssl3) {
        var cwSpec = ssl3.cwSpec;
        var masterSecret_Ptr = NSS.parse_struct_sl3CipherSpecStr(cwSpec).master_secret;
        var master_secret = NSS.get_Secret_As_HexString(masterSecret_Ptr);
        return master_secret;
    }
    /**
     * ss->ssl3.hs.client_random
     *
     * @param {*} ssl3 is a ptr to current parsed ssl3 struct
     * @returns the client_random as hex string (lower case)
     */
    static getClientRandom(ssl3) {
        var client_random = NSS.getHexString(ssl3.hs.client_random, NSS.SSL3_RANDOM_LENGTH);
        return client_random;
    }
    /**
    
     
    typedef struct sslSocketStr sslSocket;
     *
    
        SSL Socket struct (https://github.com/nss-dev/nss/blob/master/lib/ssl/sslimpl.h#L971)
    struct sslSocketStr {
    PRFileDesc *fd;                                                                     +8
    
    /* Pointer to operations vector for this socket *
    const sslSocketOps *ops;                                                            +8
    
    /* SSL socket options *
    sslOptions opt;                                                                     sizeOf(sslOptions) --> 40
    /* Enabled version range *
    SSLVersionRange vrange;                                                             + 4
    
    /* A function that returns the current time. *
    SSLTimeFunc now;                                                                    +8
    void *nowArg;                                                                       +8
    
    /* State flags *
    unsigned long clientAuthRequested;                                                  +8
    unsigned long delayDisabled;     /* Nagle delay disabled *                          +8
    unsigned long firstHsDone;       /* first handshake is complete. *                  +8
    unsigned long enoughFirstHsDone; /* enough of the first handshake is                +8
                                      * done for callbacks to be able to
                                      * retrieve channel security
                                      * parameters from the SSL socket. *
    unsigned long handshakeBegun;                                                       +8
    unsigned long lastWriteBlocked;                                                     +8
    unsigned long recvdCloseNotify; /* received SSL EOF. *                              +8
    unsigned long TCPconnected;                                                         +8
    unsigned long appDataBuffered;                                                      +8
    unsigned long peerRequestedProtection; /* from old renegotiation *                  +8
    
    /* version of the protocol to use *
    SSL3ProtocolVersion version;                                                        +4
    SSL3ProtocolVersion clientHelloVersion; /* version sent in client hello. *          --> at offset 160
     */
    static get_SSL_Version(pRFileDesc) {
        var ssl_version_internal_Code = -1;
        var sslSocket = NSS.get_SSL_FD(pRFileDesc);
        if (sslSocket.isNull()) {
            return -1;
        }
        var sslVersion_pointerSize = 160;
        ssl_version_internal_Code = sslSocket.add((sslVersion_pointerSize)).readU16();
        return ssl_version_internal_Code;
    }
    static get_Secret_As_HexString(secret_key_Ptr) {
        var rv = NSS.PK11_ExtractKeyValue(secret_key_Ptr);
        if (rv != SECStatus.SECSuccess) {
            //log("[**] ERROR access the secret key");
            return "";
        }
        var keyData = NSS.PK11_GetKeyData(secret_key_Ptr); // return value is a SECItem
        var keyData_SECITem = NSS.parse_struct_SECItem(keyData);
        var secret_as_hexString = NSS.getHexString(keyData_SECITem.data, keyData_SECITem.len);
        return secret_as_hexString;
    }
    /**
     *
     * @param {*} ssl_version_internal_Code
     * @returns
     *
     *      https://github.com/nss-dev/nss/blob/c989bde00fe64c1b37df13c773adf3e91cc258c7/lib/ssl/sslproto.h#L16
     *      #define SSL_LIBRARY_VERSION_TLS_1_2             0x0303
     *      #define SSL_LIBRARY_VERSION_TLS_1_3             0x0304
     *
     *      0x0303 -->  771
     *      0x0304 -->  772
     *
     */
    static is_TLS_1_3(ssl_version_internal_Code) {
        if (ssl_version_internal_Code > 771) {
            return true;
        }
        else {
            return false;
        }
    }
    //see nss/lib/ssl/sslinfo.c for details */
    static get_Keylog_Dump(type, client_random, key) {
        return type + " " + client_random + " " + key;
    }
    /**
     *
     * @param {*} pRFileDesc
     * @param {*} dumping_handshake_secrets  a zero indicates an false and that the handshake just completed. A 1 indicates a true so that we are during the handshake itself
     * @returns
     */
    static getTLS_Keys(pRFileDesc, dumping_handshake_secrets) {
        var message = {};
        message["contentType"] = "keylog";
        (0, log_1.devlog)("[*] trying to log some keying materials ...");
        var sslSocketFD = NSS.get_SSL_FD(pRFileDesc);
        if (sslSocketFD.isNull()) {
            return;
        }
        var sslSocketStr = NSS.parse_struct_sslSocketStr(sslSocketFD);
        var ssl3_struct = sslSocketStr.ssl3;
        var ssl3 = NSS.parse_struct_ssl3Str(ssl3_struct);
        // the client_random is used to identify the diffrent SSL streams with their corresponding secrets
        var client_random = NSS.getClientRandom(ssl3);
        if (NSS.doTLS13_RTT0 == 1) {
            //var early_exporter_secret = get_Secret_As_HexString(ssl3_struct.add(768).readPointer()); //EARLY_EXPORTER_SECRET
            var early_exporter_secret = NSS.get_Secret_As_HexString(ssl3.hs.earlyExporterSecret); //EARLY_EXPORTER_SECRET
            (0, log_1.devlog)(NSS.get_Keylog_Dump("EARLY_EXPORTER_SECRET", client_random, early_exporter_secret));
            message["keylog"] = NSS.get_Keylog_Dump("EARLY_EXPORTER_SECRET", client_random, early_exporter_secret);
            send(message);
            NSS.doTLS13_RTT0 = -1;
        }
        if (dumping_handshake_secrets == 1) {
            (0, log_1.devlog)("[*] exporting TLS 1.3 handshake keying material");
            /*
             * Those keys are computed in the beginning of a handshake
             */
            //var client_handshake_traffic_secret = get_Secret_As_HexString(ssl3_struct.add(736).readPointer()); //CLIENT_HANDSHAKE_TRAFFIC_SECRET
            var client_handshake_traffic_secret = NSS.get_Secret_As_HexString(ssl3.hs.clientHsTrafficSecret); //CLIENT_HANDSHAKE_TRAFFIC_SECRET
            //parse_struct_ssl3Str(ssl3_struct)
            (0, log_1.devlog)(NSS.get_Keylog_Dump("CLIENT_HANDSHAKE_TRAFFIC_SECRET", client_random, client_handshake_traffic_secret));
            message["keylog"] = NSS.get_Keylog_Dump("CLIENT_HANDSHAKE_TRAFFIC_SECRET", client_random, client_handshake_traffic_secret);
            send(message);
            //var server_handshake_traffic_secret = get_Secret_As_HexString(ssl3_struct.add(744).readPointer()); //SERVER_HANDSHAKE_TRAFFIC_SECRET
            var server_handshake_traffic_secret = NSS.get_Secret_As_HexString(ssl3.hs.serverHsTrafficSecret); //SERVER_HANDSHAKE_TRAFFIC_SECRET
            (0, log_1.devlog)(NSS.get_Keylog_Dump("SERVER_HANDSHAKE_TRAFFIC_SECRET", client_random, server_handshake_traffic_secret));
            message["keylog"] = NSS.get_Keylog_Dump("SERVER_HANDSHAKE_TRAFFIC_SECRET", client_random, server_handshake_traffic_secret);
            send(message);
            return;
        }
        else if (dumping_handshake_secrets == 2) {
            (0, log_1.devlog)("[*] exporting TLS 1.3 RTT0 handshake keying material");
            var client_early_traffic_secret = NSS.get_Secret_As_HexString(ssl3.hs.clientEarlyTrafficSecret); //CLIENT_EARLY_TRAFFIC_SECRET
            (0, log_1.devlog)(NSS.get_Keylog_Dump("CLIENT_EARLY_TRAFFIC_SECRET", client_random, client_early_traffic_secret));
            message["keylog"] = NSS.get_Keylog_Dump("CLIENT_EARLY_TRAFFIC_SECRET", client_random, client_early_traffic_secret);
            send(message);
            NSS.doTLS13_RTT0 = 1; // there is no callback for the EARLY_EXPORTER_SECRET
            return;
        }
        var ssl_version_internal_Code = NSS.get_SSL_Version(pRFileDesc);
        if (NSS.is_TLS_1_3(ssl_version_internal_Code)) {
            (0, log_1.devlog)("[*] exporting TLS 1.3 keying material");
            var client_traffic_secret = NSS.get_Secret_As_HexString(ssl3.hs.clientTrafficSecret); //CLIENT_TRAFFIC_SECRET_0
            (0, log_1.devlog)(NSS.get_Keylog_Dump("CLIENT_TRAFFIC_SECRET_0", client_random, client_traffic_secret));
            message["keylog"] = NSS.get_Keylog_Dump("CLIENT_TRAFFIC_SECRET_0", client_random, client_traffic_secret);
            send(message);
            var server_traffic_secret = NSS.get_Secret_As_HexString(ssl3.hs.serverTrafficSecret); //SERVER_TRAFFIC_SECRET_0
            (0, log_1.devlog)(NSS.get_Keylog_Dump("SERVER_TRAFFIC_SECRET_0", client_random, server_traffic_secret));
            message["keylog"] = NSS.get_Keylog_Dump("SERVER_TRAFFIC_SECRET_0", client_random, server_traffic_secret);
            send(message);
            var exporter_secret = NSS.get_Secret_As_HexString(ssl3.hs.exporterSecret); //EXPORTER_SECRET 
            (0, log_1.devlog)(NSS.get_Keylog_Dump("EXPORTER_SECRET", client_random, exporter_secret));
            message["keylog"] = NSS.get_Keylog_Dump("EXPORTER_SECRET", client_random, exporter_secret);
            send(message);
        }
        else {
            (0, log_1.devlog)("[*] exporting TLS 1.2 keying material");
            var master_secret = NSS.getMasterSecret(ssl3);
            (0, log_1.devlog)(NSS.get_Keylog_Dump("CLIENT_RANDOM", client_random, master_secret));
            message["keylog"] = NSS.get_Keylog_Dump("CLIENT_RANDOM", client_random, master_secret);
            send(message);
        }
        NSS.doTLS13_RTT0 = -1;
        return;
    }
    static ssl_RecordKeyLog(sslSocketFD) {
        NSS.getTLS_Keys(sslSocketFD, 0);
    }
    /***** Installing the hooks *****/
    install_plaintext_read_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["PR_Read"], {
            onEnter: function (args) {
                // ab hier nicht mehr
                this.fd = ptr(args[0]);
                this.buf = ptr(args[1]);
            },
            onLeave: function (retval) {
                if (retval.toInt32() <= 0 || NSS.getDescType(this.fd) == PRDescType.PR_DESC_FILE) {
                    return;
                }
                var addr = Memory.alloc(8);
                var res = NSS.getpeername(this.fd, addr);
                // peername return -1 this is due to the fact that a PIPE descriptor is used to read from the SSL socket
                if (addr.readU16() == 2 || addr.readU16() == 10 || addr.readU16() == 100) {
                    var message = NSS.getPortsAndAddressesFromNSS(this.fd, true, lib_addesses);
                    (0, log_1.devlog)("Session ID: " + NSS.getSslSessionIdFromFD(this.fd));
                    message["ssl_session_id"] = NSS.getSslSessionIdFromFD(this.fd);
                    message["function"] = "NSS_read";
                    this.message = message;
                    this.message["contentType"] = "datalog";
                    var data = this.buf.readByteArray((new Uint32Array([retval]))[0]);
                }
                else {
                    var temp = this.buf.readByteArray((new Uint32Array([retval]))[0]);
                    (0, log_1.devlog)(JSON.stringify(temp));
                }
            }
        });
    }
    install_plaintext_write_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["PR_Write"], {
            onEnter: function (args) {
                this.fd = ptr(args[0]);
                this.buf = args[1];
                this.len = args[2];
            },
            onLeave: function (retval) {
                if (retval.toInt32() <= 0) { //|| NSS.getDescType(this.fd) == PRDescType.PR_DESC_FILE) {
                    return;
                }
                var addr = Memory.alloc(8);
                NSS.getsockname(this.fd, addr);
                if (addr.readU16() == 2 || addr.readU16() == 10 || addr.readU16() == 100) {
                    var message = NSS.getPortsAndAddressesFromNSS(this.fd, false, lib_addesses);
                    message["ssl_session_id"] = NSS.getSslSessionIdFromFD(this.fd);
                    message["function"] = "NSS_write";
                    message["contentType"] = "datalog";
                    send(message, this.buf.readByteArray((parseInt(this.len))));
                }
            }
        });
    }
    /***** install callbacks for key logging ******/
    /**
 *
 * This callback gets only called in TLS 1.3 and newer versions
 *
 * @param {*} pRFileDesc
 * @param {*} secret_label
 * @param {*} secret
 * @returns
 *
function tls13_RecordKeyLog(pRFileDesc, secret_label, secret){

    var sslSocketFD = get_SSL_FD(pRFileDesc);
    if(sslSocketFD == -1){
        return;
    }

    var sslSocketStr = parse_struct_sslSocketStr(sslSocketFD);

    var ssl3_struct = sslSocketStr.ssl3;
    var ssl3 = parse_struct_ssl3Str(ssl3_struct);
    

    var secret_as_hexString = get_Secret_As_HexString(secret);
    

    log(get_Keylog_Dump(secret_label,getClientRandom(ssl3),secret_as_hexString));


    return 0;
}

// our old way to get the diffrent secrets from TLS 1.3 and above
*/
    static parse_epoch_value_from_SSL_SetSecretCallback(sslSocketFD, epoch) {
        if (epoch == 1) { // client_early_traffic_secret
            NSS.getTLS_Keys(sslSocketFD, 2);
        }
        else if (epoch == 2) { // client|server}_handshake_traffic_secret
            NSS.getTLS_Keys(sslSocketFD, 1);
            /* our old way to get the diffrent secrets from TLS 1.3 and above
    
            per default we assume we are intercepting a TLS client therefore
            dir == 1 --> SERVER_HANDSHAKE_TRAFFIC_SECRET
            dir == 2 --> CLIENT_HANDSHAKE_TRAFFIC_SECRET
            typedef enum {
                ssl_secret_read = 1,
                ssl_secret_write = 2,
            } SSLSecretDirection;
            
            if(dir == 1){
                tls13_RecordKeyLog(sslSocketFD,"SERVER_HANDSHAKE_TRAFFIC_SECRET",secret);
            }else{
                tls13_RecordKeyLog(sslSocketFD,"CLIENT_HANDSHAKE_TRAFFIC_SECRET",secret);
            }*/
        }
        else if (epoch >= 3) { // {client|server}_application_traffic_secret_{N}
            return;
            // we intercept this through the handshake_callback
        }
        else {
            (0, log_1.devlog)("[-] secret_callback invocation: UNKNOWN");
        }
    }
    static insert_hook_into_secretCallback(addr_of_installed_secretCallback) {
        Interceptor.attach(addr_of_installed_secretCallback, {
            onEnter(args) {
                this.sslSocketFD = args[0];
                this.epoch = args[1];
                NSS.parse_epoch_value_from_SSL_SetSecretCallback(this.sslSocketFD, this.epoch);
            },
            onLeave(retval) {
            }
        });
    }
    /**
         * Registers a secret_callback through inserting the address to our TLS 1.3 callback function at the apprioate offset of the  SSL Socket struct
         * This is neccassy because the computed handshake secrets are already freed after the handshake is completed.
         *
         *
         * @param {*} pRFileDesc a file descriptor (NSS PRFileDesc) to a SSL socket
         * @returns
         */
    static register_secret_callback(pRFileDesc) {
        var sslSocketFD = NSS.get_SSL_FD(pRFileDesc);
        if (sslSocketFD.isNull()) {
            (0, log_1.devlog)("[-] error while installing secret callback: unable get SSL socket descriptor");
            return;
        }
        var sslSocketStr = NSS.parse_struct_sslSocketStr(sslSocketFD);
        if (NSS.is_ptr_at_mem_location(sslSocketStr.secretCallback.readPointer()) == 1) {
            NSS.insert_hook_into_secretCallback(sslSocketStr.secretCallback.readPointer());
        }
        else {
            sslSocketStr.secretCallback.writePointer(NSS.secret_callback);
        }
        (0, log_1.devlog)("[**] secret callback (" + NSS.secret_callback + ") installed to address: " + sslSocketStr.secretCallback);
    }
    install_tls_keys_callback_hook() {
    }
}
exports.NSS = NSS;

},{"../shared/shared_functions":20,"../shared/shared_structures":21,"../util/log":29}],26:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenSSL_BoringSSL = void 0;
const shared_functions_1 = require("../shared/shared_functions");
const ssl_log_1 = require("../ssl_log");
const log_1 = require("../util/log");
/**
 *
 * ToDO
 *  We need to find a way to calculate the offsets in a automated manner.
 *  Darwin: SSL_read/write need improvments
 *  Windows: how to extract the key material?
 */
class OpenSSL_BoringSSL {
    moduleName;
    socket_library;
    passed_library_method_mapping;
    // global variables
    library_method_mapping = {};
    addresses;
    static SSL_SESSION_get_id;
    static SSL_CTX_set_keylog_callback;
    static SSL_get_fd;
    static SSL_get_session;
    static keylog_callback = new NativeCallback(function (ctxPtr, linePtr) {
        var message = {};
        message["contentType"] = "keylog";
        message["keylog"] = linePtr.readCString();
        send(message);
    }, "void", ["pointer", "pointer"]);
    constructor(moduleName, socket_library, passed_library_method_mapping) {
        this.moduleName = moduleName;
        this.socket_library = socket_library;
        this.passed_library_method_mapping = passed_library_method_mapping;
        if (typeof passed_library_method_mapping !== 'undefined') {
            this.library_method_mapping = passed_library_method_mapping;
        }
        else {
            this.library_method_mapping[`*${moduleName}*`] = ["SSL_read", "SSL_write", "SSL_get_fd", "SSL_get_session", "SSL_SESSION_get_id", "SSL_new", "SSL_CTX_set_keylog_callback"];
            this.library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        }
        this.addresses = (0, shared_functions_1.readAddresses)(this.library_method_mapping);
        if (ssl_log_1.offsets != "{OFFSETS}") {
            const baseAddress = (0, shared_functions_1.getBaseAddress)(moduleName);
            if (baseAddress == null) {
                (0, log_1.log)("Unable to find base address!");
                return;
            }
            console.log(baseAddress);
            //@ts-ignore
            console.log(ssl_log_1.offsets["SSL_read"]);
            //@ts-ignore
            console.log(baseAddress.add(ptr(ssl_log_1.offsets["SSL_read"])));
            //@ts-ignore
            console.log(baseAddress.add(ptr(ssl_log_1.offsets["SSL_write"])));
            //@ts-ignore
            this.addresses["SSL_read"] = baseAddress.add(ptr(ssl_log_1.offsets["SSL_read"]));
            //@ts-ignore
            this.addresses["SSL_write"] = baseAddress.add(ptr(ssl_log_1.offsets["SSL_write"]));
        }
        OpenSSL_BoringSSL.SSL_SESSION_get_id = new NativeFunction(this.addresses["SSL_SESSION_get_id"], "pointer", ["pointer", "pointer"]);
        OpenSSL_BoringSSL.SSL_get_fd = ObjC.available ? new NativeFunction(this.addresses["BIO_get_fd"], "int", ["pointer"]) : new NativeFunction(this.addresses["SSL_get_fd"], "int", ["pointer"]);
        OpenSSL_BoringSSL.SSL_get_session = new NativeFunction(this.addresses["SSL_get_session"], "pointer", ["pointer"]);
    }
    install_plaintext_read_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["SSL_read"], {
            onEnter: function (args) {
                var message = (0, shared_functions_1.getPortsAndAddresses)(OpenSSL_BoringSSL.SSL_get_fd(args[0]), true, lib_addesses);
                message["ssl_session_id"] = OpenSSL_BoringSSL.getSslSessionId(args[0]);
                message["function"] = "SSL_read";
                this.message = message;
                this.buf = args[1];
            },
            onLeave: function (retval) {
                retval |= 0; // Cast retval to 32-bit integer.
                if (retval <= 0) {
                    return;
                }
                this.message["contentType"] = "datalog";
                send(this.message, this.buf.readByteArray(retval));
            }
        });
    }
    install_plaintext_write_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["SSL_write"], {
            onEnter: function (args) {
                if (!ObjC.available) {
                    var message = (0, shared_functions_1.getPortsAndAddresses)(OpenSSL_BoringSSL.SSL_get_fd(args[0]), false, lib_addesses);
                    message["ssl_session_id"] = OpenSSL_BoringSSL.getSslSessionId(args[0]);
                    message["function"] = "SSL_write";
                    message["contentType"] = "datalog";
                    send(message, args[1].readByteArray(parseInt(args[2])));
                } // this is a temporary workaround for the fd problem on iOS
            },
            onLeave: function (retval) {
            }
        });
    }
    install_tls_keys_callback_hook() {
        (0, log_1.log)("Error: TLS key extraction not implemented yet.");
    }
    /**
      * Get the session_id of SSL object and return it as a hex string.
      * @param {!NativePointer} ssl A pointer to an SSL object.
      * @return {dict} A string representing the session_id of the SSL object's
      *     SSL_SESSION. For example,
      *     "59FD71B7B90202F359D89E66AE4E61247954E28431F6C6AC46625D472FF76336".
      */
    static getSslSessionId(ssl) {
        var session = OpenSSL_BoringSSL.SSL_get_session(ssl);
        if (session.isNull()) {
            (0, log_1.log)("Session is null");
            return 0;
        }
        var len_pointer = Memory.alloc(4);
        var p = OpenSSL_BoringSSL.SSL_SESSION_get_id(session, len_pointer);
        var len = len_pointer.readU32();
        var session_id = "";
        for (var i = 0; i < len; i++) {
            // Read a byte, convert it to a hex string (0xAB ==> "AB"), and append
            // it to session_id.
            session_id +=
                ("0" + p.add(i).readU8().toString(16).toUpperCase()).substr(-2);
        }
        return session_id;
    }
}
exports.OpenSSL_BoringSSL = OpenSSL_BoringSSL;

},{"../shared/shared_functions":20,"../ssl_log":28,"../util/log":29}],27:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WolfSSL = void 0;
const shared_functions_1 = require("../shared/shared_functions");
const log_1 = require("../util/log");
class WolfSSL {
    moduleName;
    socket_library;
    passed_library_method_mapping;
    // global variables
    library_method_mapping = {};
    addresses;
    static wolfSSL_get_server_random;
    static wolfSSL_get_client_random;
    static wolfSSL_get_fd;
    static wolfSSL_get_session;
    static wolfSSL_SESSION_get_master_key;
    constructor(moduleName, socket_library, passed_library_method_mapping) {
        this.moduleName = moduleName;
        this.socket_library = socket_library;
        this.passed_library_method_mapping = passed_library_method_mapping;
        if (typeof passed_library_method_mapping !== 'undefined') {
            this.library_method_mapping = passed_library_method_mapping;
        }
        else {
            this.library_method_mapping[`*${moduleName}*`] = ["wolfSSL_read", "wolfSSL_write", "wolfSSL_get_fd", "wolfSSL_get_session", "wolfSSL_connect", "wolfSSL_KeepArrays", "wolfSSL_SESSION_get_master_key", "wolfSSL_get_client_random", "wolfSSL_get_server_random"];
            this.library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        }
        this.addresses = (0, shared_functions_1.readAddresses)(this.library_method_mapping);
        WolfSSL.wolfSSL_get_fd = new NativeFunction(this.addresses["wolfSSL_get_fd"], "int", ["pointer"]);
        WolfSSL.wolfSSL_get_session = new NativeFunction(this.addresses["wolfSSL_get_session"], "pointer", ["pointer"]);
    }
    install_tls_keys_callback_hook() {
        (0, log_1.log)("Error: TLS key extraction not implemented yet.");
    }
    /**
       * Get the session_id of SSL object and return it as a hex string.
       * @param {!NativePointer} ssl A pointer to an SSL object.
       * @return {dict} A string representing the session_id of the SSL object's
       *     SSL_SESSION. For example,
       *     "59FD71B7B90202F359D89E66AE4E61247954E28431F6C6AC46625D472FF76336".
       */
    static getSslSessionId(ssl) {
        var session = WolfSSL.wolfSSL_get_session(ssl);
        if (session.isNull()) {
            (0, log_1.log)("Session is null");
            return 0;
        }
        var p = session.add(8);
        var len = 32; // This comes from internals.h. It is untested!
        var session_id = "";
        for (var i = 0; i < len; i++) {
            // Read a byte, convert it to a hex string (0xAB ==> "AB"), and append
            // it to session_id.
            session_id +=
                ("0" + p.add(i).readU8().toString(16).toUpperCase()).substr(-2);
        }
        return session_id;
    }
    install_plaintext_read_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["wolfSSL_read"], {
            onEnter: function (args) {
                var message = (0, shared_functions_1.getPortsAndAddresses)(WolfSSL.wolfSSL_get_fd(args[0]), true, lib_addesses);
                message["function"] = "wolfSSL_read";
                message["ssl_session_id"] = WolfSSL.getSslSessionId(args[0]);
                this.message = message;
                this.buf = args[1];
            },
            onLeave: function (retval) {
                retval |= 0; // Cast retval to 32-bit integer.
                if (retval <= 0) {
                    return;
                }
                this.message["contentType"] = "datalog";
                send(this.message, this.buf.readByteArray(retval));
            }
        });
    }
    install_plaintext_write_hook() {
        var lib_addesses = this.addresses;
        Interceptor.attach(this.addresses["wolfSSL_write"], {
            onEnter: function (args) {
                var message = (0, shared_functions_1.getPortsAndAddresses)(WolfSSL.wolfSSL_get_fd(args[0]), false, lib_addesses);
                message["ssl_session_id"] = WolfSSL.getSslSessionId(args[0]);
                message["function"] = "wolfSSL_write";
                message["contentType"] = "datalog";
                send(message, args[1].readByteArray(parseInt(args[2])));
            },
            onLeave: function (retval) {
            }
        });
    }
}
exports.WolfSSL = WolfSSL;

},{"../shared/shared_functions":20,"../util/log":29}],28:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOffsets = exports.offsets = void 0;
const android_agent_1 = require("./android/android_agent");
const ios_agent_1 = require("./ios/ios_agent");
const macos_agent_1 = require("./macos/macos_agent");
const linux_agent_1 = require("./linux/linux_agent");
const windows_agent_1 = require("./windows/windows_agent");
const process_infos_1 = require("./util/process_infos");
const log_1 = require("./util/log");
exports.offsets = "{OFFSETS}";
/*

create the TLS library for your first prototpye as a lib in ./ssl_lib and than extend this class for the OS where this new lib was tested.

Further keep in mind, that properties of an class only visible inside the Interceptor-onEnter/onLeave scope when they are static.
As an alternative you could make a local variable inside the calling functions which holds an reference to the class property.

*/
function getOffsets() {
    return exports.offsets;
}
exports.getOffsets = getOffsets;
function load_os_specific_agent() {
    if ((0, process_infos_1.isWindows)()) {
        (0, windows_agent_1.load_windows_hooking_agent)();
    }
    else if ((0, process_infos_1.isAndroid)()) {
        (0, android_agent_1.load_android_hooking_agent)();
    }
    else if ((0, process_infos_1.isLinux)()) {
        (0, linux_agent_1.load_linux_hooking_agent)();
    }
    else if ((0, process_infos_1.isiOS)()) {
        (0, ios_agent_1.load_ios_hooking_agent)();
    }
    else if ((0, process_infos_1.isMacOS)()) {
        (0, macos_agent_1.load_macos_hooking_agent)();
    }
    else {
        (0, log_1.log)("Error: not supported plattform!\nIf you want to have support for this plattform please make an issue at our github page.");
    }
}
load_os_specific_agent();

},{"./android/android_agent":1,"./ios/ios_agent":10,"./linux/linux_agent":13,"./macos/macos_agent":18,"./util/log":29,"./util/process_infos":30,"./windows/windows_agent":36}],29:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devlog = exports.log = void 0;
function log(str) {
    var message = {};
    message["contentType"] = "console";
    message["console"] = str;
    send(message);
}
exports.log = log;
function devlog(str) {
    var message = {};
    message["contentType"] = "console_dev";
    message["console_dev"] = str;
    send(message);
}
exports.devlog = devlog;

},{}],30:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWindows = exports.isLinux = exports.isMacOS = exports.isiOS = exports.isAndroid = exports.get_process_architecture = void 0;
function get_process_architecture() {
    return Process.arch;
}
exports.get_process_architecture = get_process_architecture;
function isAndroid() {
    if (Java.available && Process.platform == "linux") {
        try {
            Java.androidVersion; // this will raise an error when we are not under Android
            return true;
        }
        catch (error) {
            return false;
        }
    }
    else {
        return false;
    }
}
exports.isAndroid = isAndroid;
function isiOS() {
    if (get_process_architecture() === "arm64" && Process.platform == "darwin") {
        try {
            // check if iOS or MacOS (currently we handle MacOS with ARM Processor as an iOS device)
            return true;
        }
        catch (error) {
            return false;
        }
    }
    else {
        return false;
    }
}
exports.isiOS = isiOS;
function isMacOS() {
    if (get_process_architecture() === "x64" && Process.platform == "darwin") {
        return true;
    }
    else {
        return false;
    }
}
exports.isMacOS = isMacOS;
function isLinux() {
    if (Java.available == false && Process.platform == "linux") {
        return true;
    }
    else {
        try {
            Java.androidVersion; // this will raise an error when we are not under Android
            return false;
        }
        catch (error) {
            return true;
        }
    }
}
exports.isLinux = isLinux;
function isWindows() {
    if (Process.platform == "windows") {
        return true;
    }
    else {
        return false;
    }
}
exports.isWindows = isWindows;

},{}],31:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gnutls_execute = exports.GnuTLS_Windows = void 0;
const gnutls_1 = require("../ssl_lib/gnutls");
const windows_agent_1 = require("./windows_agent");
class GnuTLS_Windows extends gnutls_1.GnuTLS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        //this.install_tls_keys_callback_hook();
    }
    install_tls_keys_callback_hook() {
        //Not implemented yet
    }
}
exports.GnuTLS_Windows = GnuTLS_Windows;
function gnutls_execute(moduleName) {
    var gnu_ssl = new GnuTLS_Windows(moduleName, windows_agent_1.socket_library);
    gnu_ssl.execute_hooks();
}
exports.gnutls_execute = gnutls_execute;

},{"../ssl_lib/gnutls":22,"./windows_agent":36}],32:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mbedTLS_execute = exports.mbed_TLS_Windows = void 0;
const mbedTLS_1 = require("../ssl_lib/mbedTLS");
const windows_agent_1 = require("./windows_agent");
class mbed_TLS_Windows extends mbedTLS_1.mbed_TLS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        super(moduleName, socket_library);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    /*
    SSL_CTX_set_keylog_callback not exported by default on windows.

    We need to find a way to install the callback function for doing that

    Alternatives?:SSL_export_keying_material, SSL_SESSION_get_master_key
    */
    install_tls_keys_callback_hook() {
        // install hooking for windows
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
    }
}
exports.mbed_TLS_Windows = mbed_TLS_Windows;
function mbedTLS_execute(moduleName) {
    var mbedTLS_ssl = new mbed_TLS_Windows(moduleName, windows_agent_1.socket_library);
    mbedTLS_ssl.execute_hooks();
}
exports.mbedTLS_execute = mbedTLS_execute;

},{"../ssl_lib/mbedTLS":24,"./windows_agent":36}],33:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nss_execute = exports.NSS_Windows = void 0;
const nss_1 = require("../ssl_lib/nss");
const windows_agent_1 = require("./windows_agent");
class NSS_Windows extends nss_1.NSS {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        var library_method_mapping = {};
        library_method_mapping[`*${moduleName}*`] = ["PR_Write", "PR_Read", "PR_FileDesc2NativeHandle", "PR_GetPeerName", "PR_GetSockName", "PR_GetNameForIdentity"];
        // library_method_mapping[`*libnss*`] = ["PK11_ExtractKeyValue", "PK11_GetKeyData"]
        library_method_mapping["*ssl*.dll"] = ["SSL_ImportFD", "SSL_GetSessionID", "SSL_HandshakeCallback"];
        super(moduleName, socket_library, library_method_mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    install_tls_keys_callback_hook() {
        // TBD
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        // this.install_tls_keys_callback_hook(); needs to be implemented
    }
}
exports.NSS_Windows = NSS_Windows;
function nss_execute(moduleName) {
    var nss_ssl = new NSS_Windows(moduleName, windows_agent_1.socket_library);
    nss_ssl.execute_hooks();
}
exports.nss_execute = nss_execute;

},{"../ssl_lib/nss":25,"./windows_agent":36}],34:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boring_execute = exports.OpenSSL_BoringSSL_Windows = void 0;
const openssl_boringssl_1 = require("../ssl_lib/openssl_boringssl");
const windows_agent_1 = require("./windows_agent");
class OpenSSL_BoringSSL_Windows extends openssl_boringssl_1.OpenSSL_BoringSSL {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        let mapping = {};
        mapping[`${moduleName}`] = ["SSL_read", "SSL_write", "SSL_get_fd", "SSL_get_session", "SSL_SESSION_get_id", "SSL_new"];
        mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        super(moduleName, socket_library, mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    /*
    SSL_CTX_set_keylog_callback not exported by default on windows.

    We need to find a way to install the callback function for doing that

    Alternatives?:SSL_export_keying_material, SSL_SESSION_get_master_key
    */
    install_tls_keys_callback_hook() {
        // install hooking for windows
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
    }
}
exports.OpenSSL_BoringSSL_Windows = OpenSSL_BoringSSL_Windows;
function boring_execute(moduleName) {
    var boring_ssl = new OpenSSL_BoringSSL_Windows(moduleName, windows_agent_1.socket_library);
    boring_ssl.execute_hooks();
}
exports.boring_execute = boring_execute;

},{"../ssl_lib/openssl_boringssl":26,"./windows_agent":36}],35:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sspi_execute = exports.SSPI_Windows = void 0;
const shared_functions_1 = require("../shared/shared_functions");
const windows_agent_1 = require("./windows_agent");
/*

ToDo:

- Write Test Client for ground truth and test everything
- Obtain information from the running process to get the socket information instead of using default values

SspiCli.dll!DecryptMessage called!
ncrypt.dll!SslDecryptPacket called!
bcrypt.dll!BCryptDecrypt called!
*/
// This library is only existend under Windows therefore there is no Superclass
class SSPI_Windows {
    moduleName;
    socket_library;
    // global variables
    library_method_mapping = {};
    addresses;
    constructor(moduleName, socket_library) {
        this.moduleName = moduleName;
        this.socket_library = socket_library;
        this.library_method_mapping[`*${moduleName}*`] = ["DecryptMessage", "EncryptMessage"];
        this.library_method_mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        this.addresses = (0, shared_functions_1.readAddresses)(this.library_method_mapping);
    }
    install_plaintext_read_hook() {
        Interceptor.attach(this.addresses["DecryptMessage"], {
            onEnter: function (args) {
                this.pMessage = args[1];
            },
            onLeave: function () {
                this.cBuffers = this.pMessage.add(4).readULong(); //unsigned long cBuffers (Count of buffers)
                this.pBuffers = this.pMessage.add(8).readPointer(); //PSecBuffer  pBuffers (Pointer to array of secBuffers)
                //https://docs.microsoft.com/en-us/windows/win32/api/sspi/ns-sspi-secbuffer
                //One SecBuffer got 16 Bytes (unsigned long + unsigned long + pointer (64 Bit))
                //--> Bytes to read: cBuffers + 16 Bytes
                this.secBuffers = []; //Addresses of all secBuffers
                for (let i = 0; i < this.cBuffers; i++) {
                    var secBuffer = this.pBuffers.add(i * 16);
                    this.secBuffers.push(secBuffer);
                }
                for (let i = 0; i < this.secBuffers.length; i++) {
                    var size = this.secBuffers[i].add(0).readULong();
                    var type = this.secBuffers[i].add(4).readULong();
                    var bufferPointer = this.secBuffers[i].add(8).readPointer();
                    if (type == 1) {
                        //TODO: Obtain information from the running process to get the socket information
                        var bytes = bufferPointer.readByteArray(size);
                        var message = {};
                        message["ss_family"] = "AF_INET";
                        message["src_port"] = 444;
                        message["src_addr"] = 222;
                        message["dst_port"] = 443;
                        message["dst_addr"] = 222;
                        message["function"] = "DecryptMessage";
                        message["contentType"] = "datalog";
                        message["ssl_session_id"] = 10;
                        console.log(bytes);
                        send(message, bytes);
                    }
                }
            }
        });
    }
    install_plaintext_write_hook() {
        Interceptor.attach(this.addresses["EncryptMessage"], {
            onEnter: function (args) {
                this.pMessage = args[2]; //PSecBufferDesc pMessage (https://docs.microsoft.com/en-us/windows/win32/api/sspi/ns-sspi-secbufferdesc)
                this.cBuffers = this.pMessage.add(4).readULong(); //unsigned long cBuffers (Count of buffers)
                this.pBuffers = this.pMessage.add(8).readPointer(); //PSecBuffer  pBuffers (Pointer to array of secBuffers)
                //https://docs.microsoft.com/en-us/windows/win32/api/sspi/ns-sspi-secbuffer
                //One SecBuffer got 16 Bytes (unsigned long + unsigned long + pointer (64 Bit))
                //--> Bytes to read: cBuffers + 16 Bytes
                this.secBuffers = []; //Addresses of all secBuffers
                for (let i = 0; i < this.cBuffers; i++) {
                    var secBuffer = this.pBuffers.add(i * 16);
                    this.secBuffers.push(secBuffer);
                }
                for (let i = 0; i < this.secBuffers.length; i++) {
                    var size = this.secBuffers[i].add(0).readULong();
                    var type = this.secBuffers[i].add(4).readULong();
                    var bufferPointer = this.secBuffers[i].add(8).readPointer();
                    if (type == 1) {
                        //TODO: Obtain information from the running process
                        var bytes = bufferPointer.readByteArray(size);
                        var message = {};
                        message["ss_family"] = "AF_INET";
                        message["src_port"] = 443;
                        message["src_addr"] = 222;
                        message["dst_port"] = 444;
                        message["dst_addr"] = 222;
                        message["function"] = "EncryptMessage";
                        message["contentType"] = "datalog";
                        message["ssl_session_id"] = 10;
                        send(message, bytes);
                    }
                }
            }
        });
    }
    install_tls_keys_callback_hook() {
        // TBD
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
    }
}
exports.SSPI_Windows = SSPI_Windows;
function sspi_execute(moduleName) {
    var sspi_ssl = new SSPI_Windows(moduleName, windows_agent_1.socket_library);
    sspi_ssl.execute_hooks();
}
exports.sspi_execute = sspi_execute;

},{"../shared/shared_functions":20,"./windows_agent":36}],36:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.load_windows_hooking_agent = exports.socket_library = void 0;
const shared_structures_1 = require("../shared/shared_structures");
const log_1 = require("../util/log");
const shared_functions_1 = require("../shared/shared_functions");
const sspi_1 = require("./sspi");
const openssl_boringssl_windows_1 = require("./openssl_boringssl_windows");
const gnutls_windows_1 = require("./gnutls_windows");
const mbedTLS_windows_1 = require("./mbedTLS_windows");
const nss_windows_1 = require("./nss_windows");
const wolfssl_windows_1 = require("./wolfssl_windows");
var plattform_name = "Windows";
var moduleNames = (0, shared_functions_1.getModuleNames)();
exports.socket_library = "WS2_32.dll";
function hook_Windows_Dynamic_Loader(module_library_mapping) {
    try {
        const resolver = new ApiResolver('module');
        var loadLibraryExW = resolver.enumerateMatches("exports:KERNELBASE.dll!*LoadLibraryExW");
        if (loadLibraryExW.length == 0)
            return console.log("[-] Missing windows dynamic loader!");
        Interceptor.attach(loadLibraryExW[0].address, {
            onLeave(retval) {
                let map = new ModuleMap();
                let moduleName = map.findName(retval);
                if (moduleName === null)
                    return;
                for (let map of module_library_mapping[plattform_name]) {
                    let regex = map[0];
                    let func = map[1];
                    if (regex.test(moduleName)) {
                        (0, log_1.log)(`${moduleName} was loaded & will be hooked on Windows!`);
                        func(moduleName);
                    }
                }
            }
        });
        console.log("[*] Windows dynamic loader hooked.");
    }
    catch (error) {
        (0, log_1.devlog)("Loader error: " + error);
        (0, log_1.log)("No dynamic loader present for hooking.");
    }
}
function hook_Windows_SSL_Libs(module_library_mapping) {
    (0, shared_functions_1.ssl_library_loader)(plattform_name, module_library_mapping, moduleNames);
}
function load_windows_hooking_agent() {
    shared_structures_1.module_library_mapping[plattform_name] = [[/^(libssl|LIBSSL)-[0-9]+(_[0-9]+)?\.dll$/, openssl_boringssl_windows_1.boring_execute], [/^.*(wolfssl|WOLFSSL).*\.dll$/, wolfssl_windows_1.wolfssl_execute], [/^.*(libgnutls|LIBGNUTLS)-[0-9]+\.dll$/, gnutls_windows_1.gnutls_execute], [/^(nspr|NSPR)[0-9]*\.dll/, nss_windows_1.nss_execute], [/(sspicli|SSPICLI)\.dll$/, sspi_1.sspi_execute], [/mbedTLS\.dll/, mbedTLS_windows_1.mbedTLS_execute]];
    hook_Windows_SSL_Libs(shared_structures_1.module_library_mapping);
    hook_Windows_Dynamic_Loader(shared_structures_1.module_library_mapping);
}
exports.load_windows_hooking_agent = load_windows_hooking_agent;

},{"../shared/shared_functions":20,"../shared/shared_structures":21,"../util/log":29,"./gnutls_windows":31,"./mbedTLS_windows":32,"./nss_windows":33,"./openssl_boringssl_windows":34,"./sspi":35,"./wolfssl_windows":37}],37:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wolfssl_execute = exports.WolfSSL_Windows = void 0;
const wolfssl_1 = require("../ssl_lib/wolfssl");
const windows_agent_1 = require("./windows_agent");
const log_1 = require("../util/log");
class WolfSSL_Windows extends wolfssl_1.WolfSSL {
    moduleName;
    socket_library;
    constructor(moduleName, socket_library) {
        let mapping = {};
        mapping[`${moduleName}`] = ["wolfSSL_read", "wolfSSL_write", "wolfSSL_get_fd", "wolfSSL_get_session", "wolfSSL_connect", "wolfSSL_KeepArrays"];
        mapping[`*${socket_library}*`] = ["getpeername", "getsockname", "ntohs", "ntohl"];
        super(moduleName, socket_library, mapping);
        this.moduleName = moduleName;
        this.socket_library = socket_library;
    }
    install_tls_keys_callback_hook() {
        (0, log_1.log)("Key extraction currently not implemented for windows!");
    }
    execute_hooks() {
        this.install_plaintext_read_hook();
        this.install_plaintext_write_hook();
        //this.install_tls_keys_callback_hook(); currently not implemented
    }
}
exports.WolfSSL_Windows = WolfSSL_Windows;
function wolfssl_execute(moduleName) {
    var wolf_ssl = new WolfSSL_Windows(moduleName, windows_agent_1.socket_library);
    wolf_ssl.execute_hooks();
}
exports.wolfssl_execute = wolfssl_execute;

},{"../ssl_lib/wolfssl":27,"../util/log":29,"./windows_agent":36}]},{},[28])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhZ2VudC9hbmRyb2lkL2FuZHJvaWRfYWdlbnQudHMiLCJhZ2VudC9hbmRyb2lkL2FuZHJvaWRfamF2YV90bHNfbGlicy50cyIsImFnZW50L2FuZHJvaWQvYm91bmN5Y2FzdGxlLnRzIiwiYWdlbnQvYW5kcm9pZC9jb25zY3J5cHQudHMiLCJhZ2VudC9hbmRyb2lkL2dudXRsc19hbmRyb2lkLnRzIiwiYWdlbnQvYW5kcm9pZC9tYmVkVExTX2FuZHJvaWQudHMiLCJhZ2VudC9hbmRyb2lkL25zc19hbmRyb2lkLnRzIiwiYWdlbnQvYW5kcm9pZC9vcGVuc3NsX2JvcmluZ3NzbF9hbmRyb2lkLnRzIiwiYWdlbnQvYW5kcm9pZC93b2xmc3NsX2FuZHJvaWQudHMiLCJhZ2VudC9pb3MvaW9zX2FnZW50LnRzIiwiYWdlbnQvaW9zL29wZW5zc2xfYm9yaW5nc3NsX2lvcy50cyIsImFnZW50L2xpbnV4L2dudXRsc19saW51eC50cyIsImFnZW50L2xpbnV4L2xpbnV4X2FnZW50LnRzIiwiYWdlbnQvbGludXgvbWJlZFRMU19saW51eC50cyIsImFnZW50L2xpbnV4L25zc19saW51eC50cyIsImFnZW50L2xpbnV4L29wZW5zc2xfYm9yaW5nc3NsX2xpbnV4LnRzIiwiYWdlbnQvbGludXgvd29sZnNzbF9saW51eC50cyIsImFnZW50L21hY29zL21hY29zX2FnZW50LnRzIiwiYWdlbnQvbWFjb3Mvb3BlbnNzbF9ib3Jpbmdzc2xfbWFjb3MudHMiLCJhZ2VudC9zaGFyZWQvc2hhcmVkX2Z1bmN0aW9ucy50cyIsImFnZW50L3NoYXJlZC9zaGFyZWRfc3RydWN0dXJlcy50cyIsImFnZW50L3NzbF9saWIvZ251dGxzLnRzIiwiYWdlbnQvc3NsX2xpYi9qYXZhX3NzbF9saWJzLnRzIiwiYWdlbnQvc3NsX2xpYi9tYmVkVExTLnRzIiwiYWdlbnQvc3NsX2xpYi9uc3MudHMiLCJhZ2VudC9zc2xfbGliL29wZW5zc2xfYm9yaW5nc3NsLnRzIiwiYWdlbnQvc3NsX2xpYi93b2xmc3NsLnRzIiwiYWdlbnQvc3NsX2xvZy50cyIsImFnZW50L3V0aWwvbG9nLnRzIiwiYWdlbnQvdXRpbC9wcm9jZXNzX2luZm9zLnRzIiwiYWdlbnQvd2luZG93cy9nbnV0bHNfd2luZG93cy50cyIsImFnZW50L3dpbmRvd3MvbWJlZFRMU193aW5kb3dzLnRzIiwiYWdlbnQvd2luZG93cy9uc3Nfd2luZG93cy50cyIsImFnZW50L3dpbmRvd3Mvb3BlbnNzbF9ib3Jpbmdzc2xfd2luZG93cy50cyIsImFnZW50L3dpbmRvd3Mvc3NwaS50cyIsImFnZW50L3dpbmRvd3Mvd2luZG93c19hZ2VudC50cyIsImFnZW50L3dpbmRvd3Mvd29sZnNzbF93aW5kb3dzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7O0FDQUEsbUVBQW9FO0FBQ3BFLGlFQUErRTtBQUMvRSxxQ0FBeUM7QUFDekMscURBQWlEO0FBQ2pELHVEQUFtRDtBQUNuRCwrQ0FBMkM7QUFDM0MsdURBQW1EO0FBQ25ELDJFQUE0RDtBQUM1RCxtRUFBcUQ7QUFHckQsSUFBSSxjQUFjLEdBQUcsU0FBUyxDQUFDO0FBQy9CLElBQUksV0FBVyxHQUFrQixJQUFBLGlDQUFjLEdBQUUsQ0FBQztBQUVyQyxRQUFBLGNBQWMsR0FBRyxNQUFNLENBQUE7QUFFcEMsU0FBUyxrQkFBa0I7SUFDdkIsSUFBQSxvQ0FBWSxHQUFFLENBQUM7QUFDbkIsQ0FBQztBQUVELFNBQVMsMkJBQTJCLENBQUMsc0JBQW1GO0lBQ3BILElBQUk7UUFDSixNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUE7UUFDbkMsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQTtRQUNyRSxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUM7WUFDcEIsTUFBTSxtQ0FBbUMsQ0FBQTtTQUM1QztRQUVELElBQUks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