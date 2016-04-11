"format global";
(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  var getOwnPropertyDescriptor = true;
  try {
    Object.getOwnPropertyDescriptor({ a: 0 }, 'a');
  }
  catch(e) {
    getOwnPropertyDescriptor = false;
  }

  var defineProperty;
  (function () {
    try {
      if (!!Object.defineProperty({}, 'a', {}))
        defineProperty = Object.defineProperty;
    }
    catch (e) {
      defineProperty = function(obj, prop, opt) {
        try {
          obj[prop] = opt.value || opt.get.call(obj);
        }
        catch(e) {}
      }
    }
  })();

  function register(name, deps, declare) {
    if (arguments.length === 4)
      return registerDynamic.apply(this, arguments);
    doRegister(name, {
      declarative: true,
      deps: deps,
      declare: declare
    });
  }

  function registerDynamic(name, deps, executingRequire, execute) {
    doRegister(name, {
      declarative: false,
      deps: deps,
      executingRequire: executingRequire,
      execute: execute
    });
  }

  function doRegister(name, entry) {
    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry;

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }


  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative;
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;

      if (typeof name == 'object') {
        for (var p in name)
          exports[p] = name[p];
      }
      else {
        exports[name] = value;
      }

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          for (var j = 0; j < importerModule.dependencies.length; ++j) {
            if (importerModule.dependencies[j] === module) {
              importerModule.setters[j](exports);
            }
          }
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = depEntry.esModule;
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;

    // create the esModule object, which allows ES6 named imports of dynamics
    exports = module.exports;

    if (exports && exports.__esModule) {
      entry.esModule = exports;
    }
    else {
      entry.esModule = {};

      // don't trigger getters/setters in environments that support them
      if (typeof exports == 'object' || typeof exports == 'function') {
        if (getOwnPropertyDescriptor) {
          var d;
          for (var p in exports)
            if (d = Object.getOwnPropertyDescriptor(exports, p))
              defineProperty(entry.esModule, p, d);
        }
        else {
          var hasOwnProperty = exports && exports.hasOwnProperty;
          for (var p in exports) {
            if (!hasOwnProperty || exports.hasOwnProperty(p))
              entry.esModule[p] = exports[p];
          }
         }
       }
      entry.esModule['default'] = exports;
      defineProperty(entry.esModule, '__useDefault', {
        value: true
      });
    }
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    // node core modules
    if (name.substr(0, 6) == '@node/')
      return require(name.substr(6));

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    // exported modules get __esModule defined for interop
    if (entry.declarative)
      defineProperty(entry.module.exports, '__esModule', { value: true });

    // return the defined module object
    return modules[name] = entry.declarative ? entry.module.exports : entry.esModule;
  };

  return function(mains, depNames, declare) {
    return function(formatDetect) {
      formatDetect(function(deps) {
        var System = {
          _nodeRequire: typeof require != 'undefined' && require.resolve && typeof process != 'undefined' && require,
          register: register,
          registerDynamic: registerDynamic,
          get: load,
          set: function(name, module) {
            modules[name] = module;
          },
          newModule: function(module) {
            return module;
          }
        };
        System.set('@empty', {});

        // register external dependencies
        for (var i = 0; i < depNames.length; i++) (function(depName, dep) {
          if (dep && dep.__esModule)
            System.register(depName, [], function(_export) {
              return {
                setters: [],
                execute: function() {
                  for (var p in dep)
                    if (p != '__esModule' && !(typeof p == 'object' && p + '' == 'Module'))
                      _export(p, dep[p]);
                }
              };
            });
          else
            System.registerDynamic(depName, [], false, function() {
              return dep;
            });
        })(depNames[i], arguments[i]);

        // register modules in this bundle
        declare(System);

        // load mains
        var firstLoad = load(mains[0]);
        if (mains.length > 1)
          for (var i = 1; i < mains.length; i++)
            load(mains[i]);

        if (firstLoad.__useDefault)
          return firstLoad['default'];
        else
          return firstLoad;
      });
    };
  };

})(typeof self != 'undefined' ? self : global)
/* (['mainModule'], ['external-dep'], function($__System) {
  System.register(...);
})
(function(factory) {
  if (typeof define && define.amd)
    define(['external-dep'], factory);
  // etc UMD / module pattern
})*/

(['16'], [], function($__System) {

(function(__global) {
  var loader = $__System;
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function readMemberExpression(p, value) {
    var pParts = p.split('.');
    while (pParts.length)
      value = value[pParts.shift()];
    return value;
  }

  // bare minimum ignores for IE8
  var ignoredGlobalProps = ['_g', 'sessionStorage', 'localStorage', 'clipboardData', 'frames', 'external', 'mozAnimationStartTime', 'webkitStorageInfo', 'webkitIndexedDB'];

  var globalSnapshot;

  function forEachGlobal(callback) {
    if (Object.keys)
      Object.keys(__global).forEach(callback);
    else
      for (var g in __global) {
        if (!hasOwnProperty.call(__global, g))
          continue;
        callback(g);
      }
  }

  function forEachGlobalValue(callback) {
    forEachGlobal(function(globalName) {
      if (indexOf.call(ignoredGlobalProps, globalName) != -1)
        return;
      try {
        var value = __global[globalName];
      }
      catch (e) {
        ignoredGlobalProps.push(globalName);
      }
      callback(globalName, value);
    });
  }

  loader.set('@@global-helpers', loader.newModule({
    prepareGlobal: function(moduleName, exportName, globals) {
      // disable module detection
      var curDefine = __global.define;

      __global.define = undefined;
      __global.exports = undefined;
      if (__global.module && __global.module.exports)
        __global.module = undefined;

      // set globals
      var oldGlobals;
      if (globals) {
        oldGlobals = {};
        for (var g in globals) {
          oldGlobals[g] = globals[g];
          __global[g] = globals[g];
        }
      }

      // store a complete copy of the global object in order to detect changes
      if (!exportName) {
        globalSnapshot = {};

        forEachGlobalValue(function(name, value) {
          globalSnapshot[name] = value;
        });
      }

      // return function to retrieve global
      return function() {
        var globalValue;

        if (exportName) {
          globalValue = readMemberExpression(exportName, __global);
        }
        else {
          var singleGlobal;
          var multipleExports;
          var exports = {};

          forEachGlobalValue(function(name, value) {
            if (globalSnapshot[name] === value)
              return;
            if (typeof value == 'undefined')
              return;
            exports[name] = value;

            if (typeof singleGlobal != 'undefined') {
              if (!multipleExports && singleGlobal !== value)
                multipleExports = true;
            }
            else {
              singleGlobal = value;
            }
          });
          globalValue = multipleExports ? exports : singleGlobal;
        }

        // revert globals
        if (oldGlobals) {
          for (var g in oldGlobals)
            __global[g] = oldGlobals[g];
        }
        __global.define = curDefine;

        return globalValue;
      };
    }
  }));

})(typeof self != 'undefined' ? self : global);

(function(__global) {
  var loader = $__System;
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  var commentRegEx = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg;
  var cjsRequirePre = "(?:^|[^$_a-zA-Z\\xA0-\\uFFFF.])";
  var cjsRequirePost = "\\s*\\(\\s*(\"([^\"]+)\"|'([^']+)')\\s*\\)";
  var fnBracketRegEx = /\(([^\)]*)\)/;
  var wsRegEx = /^\s+|\s+$/g;

  var requireRegExs = {};

  function getCJSDeps(source, requireIndex) {

    // remove comments
    source = source.replace(commentRegEx, '');

    // determine the require alias
    var params = source.match(fnBracketRegEx);
    var requireAlias = (params[1].split(',')[requireIndex] || 'require').replace(wsRegEx, '');

    // find or generate the regex for this requireAlias
    var requireRegEx = requireRegExs[requireAlias] || (requireRegExs[requireAlias] = new RegExp(cjsRequirePre + requireAlias + cjsRequirePost, 'g'));

    requireRegEx.lastIndex = 0;

    var deps = [];

    var match;
    while (match = requireRegEx.exec(source))
      deps.push(match[2] || match[3]);

    return deps;
  }

  /*
    AMD-compatible require
    To copy RequireJS, set window.require = window.requirejs = loader.amdRequire
  */
  function require(names, callback, errback, referer) {
    // in amd, first arg can be a config object... we just ignore
    if (typeof names == 'object' && !(names instanceof Array))
      return require.apply(null, Array.prototype.splice.call(arguments, 1, arguments.length - 1));

    // amd require
    if (typeof names == 'string' && typeof callback == 'function')
      names = [names];
    if (names instanceof Array) {
      var dynamicRequires = [];
      for (var i = 0; i < names.length; i++)
        dynamicRequires.push(loader['import'](names[i], referer));
      Promise.all(dynamicRequires).then(function(modules) {
        if (callback)
          callback.apply(null, modules);
      }, errback);
    }

    // commonjs require
    else if (typeof names == 'string') {
      var module = loader.get(names);
      return module.__useDefault ? module['default'] : module;
    }

    else
      throw new TypeError('Invalid require');
  }

  function define(name, deps, factory) {
    if (typeof name != 'string') {
      factory = deps;
      deps = name;
      name = null;
    }
    if (!(deps instanceof Array)) {
      factory = deps;
      deps = ['require', 'exports', 'module'].splice(0, factory.length);
    }

    if (typeof factory != 'function')
      factory = (function(factory) {
        return function() { return factory; }
      })(factory);

    // in IE8, a trailing comma becomes a trailing undefined entry
    if (deps[deps.length - 1] === undefined)
      deps.pop();

    // remove system dependencies
    var requireIndex, exportsIndex, moduleIndex;

    if ((requireIndex = indexOf.call(deps, 'require')) != -1) {

      deps.splice(requireIndex, 1);

      // only trace cjs requires for non-named
      // named defines assume the trace has already been done
      if (!name)
        deps = deps.concat(getCJSDeps(factory.toString(), requireIndex));
    }

    if ((exportsIndex = indexOf.call(deps, 'exports')) != -1)
      deps.splice(exportsIndex, 1);

    if ((moduleIndex = indexOf.call(deps, 'module')) != -1)
      deps.splice(moduleIndex, 1);

    var define = {
      name: name,
      deps: deps,
      execute: function(req, exports, module) {

        var depValues = [];
        for (var i = 0; i < deps.length; i++)
          depValues.push(req(deps[i]));

        module.uri = module.id;

        module.config = function() {};

        // add back in system dependencies
        if (moduleIndex != -1)
          depValues.splice(moduleIndex, 0, module);

        if (exportsIndex != -1)
          depValues.splice(exportsIndex, 0, exports);

        if (requireIndex != -1)
          depValues.splice(requireIndex, 0, function(names, callback, errback) {
            if (typeof names == 'string' && typeof callback != 'function')
              return req(names);
            return require.call(loader, names, callback, errback, module.id);
          });

        var output = factory.apply(exportsIndex == -1 ? __global : exports, depValues);

        if (typeof output == 'undefined' && module)
          output = module.exports;

        if (typeof output != 'undefined')
          return output;
      }
    };

    // anonymous define
    if (!name) {
      // already defined anonymously -> throw
      if (lastModule.anonDefine)
        throw new TypeError('Multiple defines for anonymous module');
      lastModule.anonDefine = define;
    }
    // named define
    else {
      // if we don't have any other defines,
      // then let this be an anonymous define
      // this is just to support single modules of the form:
      // define('jquery')
      // still loading anonymously
      // because it is done widely enough to be useful
      if (!lastModule.anonDefine && !lastModule.isBundle) {
        lastModule.anonDefine = define;
      }
      // otherwise its a bundle only
      else {
        // if there is an anonDefine already (we thought it could have had a single named define)
        // then we define it now
        // this is to avoid defining named defines when they are actually anonymous
        if (lastModule.anonDefine && lastModule.anonDefine.name)
          loader.registerDynamic(lastModule.anonDefine.name, lastModule.anonDefine.deps, false, lastModule.anonDefine.execute);

        lastModule.anonDefine = null;
      }

      // note this is now a bundle
      lastModule.isBundle = true;

      // define the module through the register registry
      loader.registerDynamic(name, define.deps, false, define.execute);
    }
  }
  define.amd = {};

  // adds define as a global (potentially just temporarily)
  function createDefine(loader) {
    lastModule.anonDefine = null;
    lastModule.isBundle = false;

    // ensure no NodeJS environment detection
    var oldModule = __global.module;
    var oldExports = __global.exports;
    var oldDefine = __global.define;

    __global.module = undefined;
    __global.exports = undefined;
    __global.define = define;

    return function() {
      __global.define = oldDefine;
      __global.module = oldModule;
      __global.exports = oldExports;
    };
  }

  var lastModule = {
    isBundle: false,
    anonDefine: null
  };

  loader.set('@@amd-helpers', loader.newModule({
    createDefine: createDefine,
    require: require,
    define: define,
    lastModule: lastModule
  }));
  loader.amdDefine = define;
  loader.amdRequire = require;
})(typeof self != 'undefined' ? self : global);

"bundle";
(function() {
var _removeDefine = $__System.get("@@amd-helpers").createDefine();
(function(global, factory) {
  if (typeof module === "object" && typeof module.exports === "object") {
    module.exports = global.document ? factory(global, true) : function(w) {
      if (!w.document) {
        throw new Error("jQuery requires a window with a document");
      }
      return factory(w);
    };
  } else {
    factory(global);
  }
}(typeof window !== "undefined" ? window : this, function(window, noGlobal) {
  var arr = [];
  var slice = arr.slice;
  var concat = arr.concat;
  var push = arr.push;
  var indexOf = arr.indexOf;
  var class2type = {};
  var toString = class2type.toString;
  var hasOwn = class2type.hasOwnProperty;
  var support = {};
  var document = window.document,
      version = "2.1.4",
      jQuery = function(selector, context) {
        return new jQuery.fn.init(selector, context);
      },
      rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,
      rmsPrefix = /^-ms-/,
      rdashAlpha = /-([\da-z])/gi,
      fcamelCase = function(all, letter) {
        return letter.toUpperCase();
      };
  jQuery.fn = jQuery.prototype = {
    jquery: version,
    constructor: jQuery,
    selector: "",
    length: 0,
    toArray: function() {
      return slice.call(this);
    },
    get: function(num) {
      return num != null ? (num < 0 ? this[num + this.length] : this[num]) : slice.call(this);
    },
    pushStack: function(elems) {
      var ret = jQuery.merge(this.constructor(), elems);
      ret.prevObject = this;
      ret.context = this.context;
      return ret;
    },
    each: function(callback, args) {
      return jQuery.each(this, callback, args);
    },
    map: function(callback) {
      return this.pushStack(jQuery.map(this, function(elem, i) {
        return callback.call(elem, i, elem);
      }));
    },
    slice: function() {
      return this.pushStack(slice.apply(this, arguments));
    },
    first: function() {
      return this.eq(0);
    },
    last: function() {
      return this.eq(-1);
    },
    eq: function(i) {
      var len = this.length,
          j = +i + (i < 0 ? len : 0);
      return this.pushStack(j >= 0 && j < len ? [this[j]] : []);
    },
    end: function() {
      return this.prevObject || this.constructor(null);
    },
    push: push,
    sort: arr.sort,
    splice: arr.splice
  };
  jQuery.extend = jQuery.fn.extend = function() {
    var options,
        name,
        src,
        copy,
        copyIsArray,
        clone,
        target = arguments[0] || {},
        i = 1,
        length = arguments.length,
        deep = false;
    if (typeof target === "boolean") {
      deep = target;
      target = arguments[i] || {};
      i++;
    }
    if (typeof target !== "object" && !jQuery.isFunction(target)) {
      target = {};
    }
    if (i === length) {
      target = this;
      i--;
    }
    for (; i < length; i++) {
      if ((options = arguments[i]) != null) {
        for (name in options) {
          src = target[name];
          copy = options[name];
          if (target === copy) {
            continue;
          }
          if (deep && copy && (jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)))) {
            if (copyIsArray) {
              copyIsArray = false;
              clone = src && jQuery.isArray(src) ? src : [];
            } else {
              clone = src && jQuery.isPlainObject(src) ? src : {};
            }
            target[name] = jQuery.extend(deep, clone, copy);
          } else if (copy !== undefined) {
            target[name] = copy;
          }
        }
      }
    }
    return target;
  };
  jQuery.extend({
    expando: "jQuery" + (version + Math.random()).replace(/\D/g, ""),
    isReady: true,
    error: function(msg) {
      throw new Error(msg);
    },
    noop: function() {},
    isFunction: function(obj) {
      return jQuery.type(obj) === "function";
    },
    isArray: Array.isArray,
    isWindow: function(obj) {
      return obj != null && obj === obj.window;
    },
    isNumeric: function(obj) {
      return !jQuery.isArray(obj) && (obj - parseFloat(obj) + 1) >= 0;
    },
    isPlainObject: function(obj) {
      if (jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow(obj)) {
        return false;
      }
      if (obj.constructor && !hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
        return false;
      }
      return true;
    },
    isEmptyObject: function(obj) {
      var name;
      for (name in obj) {
        return false;
      }
      return true;
    },
    type: function(obj) {
      if (obj == null) {
        return obj + "";
      }
      return typeof obj === "object" || typeof obj === "function" ? class2type[toString.call(obj)] || "object" : typeof obj;
    },
    globalEval: function(code) {
      var script,
          indirect = eval;
      code = jQuery.trim(code);
      if (code) {
        if (code.indexOf("use strict") === 1) {
          script = document.createElement("script");
          script.text = code;
          document.head.appendChild(script).parentNode.removeChild(script);
        } else {
          indirect(code);
        }
      }
    },
    camelCase: function(string) {
      return string.replace(rmsPrefix, "ms-").replace(rdashAlpha, fcamelCase);
    },
    nodeName: function(elem, name) {
      return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
    },
    each: function(obj, callback, args) {
      var value,
          i = 0,
          length = obj.length,
          isArray = isArraylike(obj);
      if (args) {
        if (isArray) {
          for (; i < length; i++) {
            value = callback.apply(obj[i], args);
            if (value === false) {
              break;
            }
          }
        } else {
          for (i in obj) {
            value = callback.apply(obj[i], args);
            if (value === false) {
              break;
            }
          }
        }
      } else {
        if (isArray) {
          for (; i < length; i++) {
            value = callback.call(obj[i], i, obj[i]);
            if (value === false) {
              break;
            }
          }
        } else {
          for (i in obj) {
            value = callback.call(obj[i], i, obj[i]);
            if (value === false) {
              break;
            }
          }
        }
      }
      return obj;
    },
    trim: function(text) {
      return text == null ? "" : (text + "").replace(rtrim, "");
    },
    makeArray: function(arr, results) {
      var ret = results || [];
      if (arr != null) {
        if (isArraylike(Object(arr))) {
          jQuery.merge(ret, typeof arr === "string" ? [arr] : arr);
        } else {
          push.call(ret, arr);
        }
      }
      return ret;
    },
    inArray: function(elem, arr, i) {
      return arr == null ? -1 : indexOf.call(arr, elem, i);
    },
    merge: function(first, second) {
      var len = +second.length,
          j = 0,
          i = first.length;
      for (; j < len; j++) {
        first[i++] = second[j];
      }
      first.length = i;
      return first;
    },
    grep: function(elems, callback, invert) {
      var callbackInverse,
          matches = [],
          i = 0,
          length = elems.length,
          callbackExpect = !invert;
      for (; i < length; i++) {
        callbackInverse = !callback(elems[i], i);
        if (callbackInverse !== callbackExpect) {
          matches.push(elems[i]);
        }
      }
      return matches;
    },
    map: function(elems, callback, arg) {
      var value,
          i = 0,
          length = elems.length,
          isArray = isArraylike(elems),
          ret = [];
      if (isArray) {
        for (; i < length; i++) {
          value = callback(elems[i], i, arg);
          if (value != null) {
            ret.push(value);
          }
        }
      } else {
        for (i in elems) {
          value = callback(elems[i], i, arg);
          if (value != null) {
            ret.push(value);
          }
        }
      }
      return concat.apply([], ret);
    },
    guid: 1,
    proxy: function(fn, context) {
      var tmp,
          args,
          proxy;
      if (typeof context === "string") {
        tmp = fn[context];
        context = fn;
        fn = tmp;
      }
      if (!jQuery.isFunction(fn)) {
        return undefined;
      }
      args = slice.call(arguments, 2);
      proxy = function() {
        return fn.apply(context || this, args.concat(slice.call(arguments)));
      };
      proxy.guid = fn.guid = fn.guid || jQuery.guid++;
      return proxy;
    },
    now: Date.now,
    support: support
  });
  jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
    class2type["[object " + name + "]"] = name.toLowerCase();
  });
  function isArraylike(obj) {
    var length = "length" in obj && obj.length,
        type = jQuery.type(obj);
    if (type === "function" || jQuery.isWindow(obj)) {
      return false;
    }
    if (obj.nodeType === 1 && length) {
      return true;
    }
    return type === "array" || length === 0 || typeof length === "number" && length > 0 && (length - 1) in obj;
  }
  var Sizzle = (function(window) {
    var i,
        support,
        Expr,
        getText,
        isXML,
        tokenize,
        compile,
        select,
        outermostContext,
        sortInput,
        hasDuplicate,
        setDocument,
        document,
        docElem,
        documentIsHTML,
        rbuggyQSA,
        rbuggyMatches,
        matches,
        contains,
        expando = "sizzle" + 1 * new Date(),
        preferredDoc = window.document,
        dirruns = 0,
        done = 0,
        classCache = createCache(),
        tokenCache = createCache(),
        compilerCache = createCache(),
        sortOrder = function(a, b) {
          if (a === b) {
            hasDuplicate = true;
          }
          return 0;
        },
        MAX_NEGATIVE = 1 << 31,
        hasOwn = ({}).hasOwnProperty,
        arr = [],
        pop = arr.pop,
        push_native = arr.push,
        push = arr.push,
        slice = arr.slice,
        indexOf = function(list, elem) {
          var i = 0,
              len = list.length;
          for (; i < len; i++) {
            if (list[i] === elem) {
              return i;
            }
          }
          return -1;
        },
        booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",
        whitespace = "[\\x20\\t\\r\\n\\f]",
        characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",
        identifier = characterEncoding.replace("w", "w#"),
        attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace + "*([*^$|!~]?=)" + whitespace + "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace + "*\\]",
        pseudos = ":(" + characterEncoding + ")(?:\\((" + "('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" + "((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" + ".*" + ")\\)|)",
        rwhitespace = new RegExp(whitespace + "+", "g"),
        rtrim = new RegExp("^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g"),
        rcomma = new RegExp("^" + whitespace + "*," + whitespace + "*"),
        rcombinators = new RegExp("^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*"),
        rattributeQuotes = new RegExp("=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g"),
        rpseudo = new RegExp(pseudos),
        ridentifier = new RegExp("^" + identifier + "$"),
        matchExpr = {
          "ID": new RegExp("^#(" + characterEncoding + ")"),
          "CLASS": new RegExp("^\\.(" + characterEncoding + ")"),
          "TAG": new RegExp("^(" + characterEncoding.replace("w", "w*") + ")"),
          "ATTR": new RegExp("^" + attributes),
          "PSEUDO": new RegExp("^" + pseudos),
          "CHILD": new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i"),
          "bool": new RegExp("^(?:" + booleans + ")$", "i"),
          "needsContext": new RegExp("^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i")
        },
        rinputs = /^(?:input|select|textarea|button)$/i,
        rheader = /^h\d$/i,
        rnative = /^[^{]+\{\s*\[native \w/,
        rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
        rsibling = /[+~]/,
        rescape = /'|\\/g,
        runescape = new RegExp("\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig"),
        funescape = function(_, escaped, escapedWhitespace) {
          var high = "0x" + escaped - 0x10000;
          return high !== high || escapedWhitespace ? escaped : high < 0 ? String.fromCharCode(high + 0x10000) : String.fromCharCode(high >> 10 | 0xD800, high & 0x3FF | 0xDC00);
        },
        unloadHandler = function() {
          setDocument();
        };
    try {
      push.apply((arr = slice.call(preferredDoc.childNodes)), preferredDoc.childNodes);
      arr[preferredDoc.childNodes.length].nodeType;
    } catch (e) {
      push = {apply: arr.length ? function(target, els) {
          push_native.apply(target, slice.call(els));
        } : function(target, els) {
          var j = target.length,
              i = 0;
          while ((target[j++] = els[i++])) {}
          target.length = j - 1;
        }};
    }
    function Sizzle(selector, context, results, seed) {
      var match,
          elem,
          m,
          nodeType,
          i,
          groups,
          old,
          nid,
          newContext,
          newSelector;
      if ((context ? context.ownerDocument || context : preferredDoc) !== document) {
        setDocument(context);
      }
      context = context || document;
      results = results || [];
      nodeType = context.nodeType;
      if (typeof selector !== "string" || !selector || nodeType !== 1 && nodeType !== 9 && nodeType !== 11) {
        return results;
      }
      if (!seed && documentIsHTML) {
        if (nodeType !== 11 && (match = rquickExpr.exec(selector))) {
          if ((m = match[1])) {
            if (nodeType === 9) {
              elem = context.getElementById(m);
              if (elem && elem.parentNode) {
                if (elem.id === m) {
                  results.push(elem);
                  return results;
                }
              } else {
                return results;
              }
            } else {
              if (context.ownerDocument && (elem = context.ownerDocument.getElementById(m)) && contains(context, elem) && elem.id === m) {
                results.push(elem);
                return results;
              }
            }
          } else if (match[2]) {
            push.apply(results, context.getElementsByTagName(selector));
            return results;
          } else if ((m = match[3]) && support.getElementsByClassName) {
            push.apply(results, context.getElementsByClassName(m));
            return results;
          }
        }
        if (support.qsa && (!rbuggyQSA || !rbuggyQSA.test(selector))) {
          nid = old = expando;
          newContext = context;
          newSelector = nodeType !== 1 && selector;
          if (nodeType === 1 && context.nodeName.toLowerCase() !== "object") {
            groups = tokenize(selector);
            if ((old = context.getAttribute("id"))) {
              nid = old.replace(rescape, "\\$&");
            } else {
              context.setAttribute("id", nid);
            }
            nid = "[id='" + nid + "'] ";
            i = groups.length;
            while (i--) {
              groups[i] = nid + toSelector(groups[i]);
            }
            newContext = rsibling.test(selector) && testContext(context.parentNode) || context;
            newSelector = groups.join(",");
          }
          if (newSelector) {
            try {
              push.apply(results, newContext.querySelectorAll(newSelector));
              return results;
            } catch (qsaError) {} finally {
              if (!old) {
                context.removeAttribute("id");
              }
            }
          }
        }
      }
      return select(selector.replace(rtrim, "$1"), context, results, seed);
    }
    function createCache() {
      var keys = [];
      function cache(key, value) {
        if (keys.push(key + " ") > Expr.cacheLength) {
          delete cache[keys.shift()];
        }
        return (cache[key + " "] = value);
      }
      return cache;
    }
    function markFunction(fn) {
      fn[expando] = true;
      return fn;
    }
    function assert(fn) {
      var div = document.createElement("div");
      try {
        return !!fn(div);
      } catch (e) {
        return false;
      } finally {
        if (div.parentNode) {
          div.parentNode.removeChild(div);
        }
        div = null;
      }
    }
    function addHandle(attrs, handler) {
      var arr = attrs.split("|"),
          i = attrs.length;
      while (i--) {
        Expr.attrHandle[arr[i]] = handler;
      }
    }
    function siblingCheck(a, b) {
      var cur = b && a,
          diff = cur && a.nodeType === 1 && b.nodeType === 1 && (~b.sourceIndex || MAX_NEGATIVE) - (~a.sourceIndex || MAX_NEGATIVE);
      if (diff) {
        return diff;
      }
      if (cur) {
        while ((cur = cur.nextSibling)) {
          if (cur === b) {
            return -1;
          }
        }
      }
      return a ? 1 : -1;
    }
    function createInputPseudo(type) {
      return function(elem) {
        var name = elem.nodeName.toLowerCase();
        return name === "input" && elem.type === type;
      };
    }
    function createButtonPseudo(type) {
      return function(elem) {
        var name = elem.nodeName.toLowerCase();
        return (name === "input" || name === "button") && elem.type === type;
      };
    }
    function createPositionalPseudo(fn) {
      return markFunction(function(argument) {
        argument = +argument;
        return markFunction(function(seed, matches) {
          var j,
              matchIndexes = fn([], seed.length, argument),
              i = matchIndexes.length;
          while (i--) {
            if (seed[(j = matchIndexes[i])]) {
              seed[j] = !(matches[j] = seed[j]);
            }
          }
        });
      });
    }
    function testContext(context) {
      return context && typeof context.getElementsByTagName !== "undefined" && context;
    }
    support = Sizzle.support = {};
    isXML = Sizzle.isXML = function(elem) {
      var documentElement = elem && (elem.ownerDocument || elem).documentElement;
      return documentElement ? documentElement.nodeName !== "HTML" : false;
    };
    setDocument = Sizzle.setDocument = function(node) {
      var hasCompare,
          parent,
          doc = node ? node.ownerDocument || node : preferredDoc;
      if (doc === document || doc.nodeType !== 9 || !doc.documentElement) {
        return document;
      }
      document = doc;
      docElem = doc.documentElement;
      parent = doc.defaultView;
      if (parent && parent !== parent.top) {
        if (parent.addEventListener) {
          parent.addEventListener("unload", unloadHandler, false);
        } else if (parent.attachEvent) {
          parent.attachEvent("onunload", unloadHandler);
        }
      }
      documentIsHTML = !isXML(doc);
      support.attributes = assert(function(div) {
        div.className = "i";
        return !div.getAttribute("className");
      });
      support.getElementsByTagName = assert(function(div) {
        div.appendChild(doc.createComment(""));
        return !div.getElementsByTagName("*").length;
      });
      support.getElementsByClassName = rnative.test(doc.getElementsByClassName);
      support.getById = assert(function(div) {
        docElem.appendChild(div).id = expando;
        return !doc.getElementsByName || !doc.getElementsByName(expando).length;
      });
      if (support.getById) {
        Expr.find["ID"] = function(id, context) {
          if (typeof context.getElementById !== "undefined" && documentIsHTML) {
            var m = context.getElementById(id);
            return m && m.parentNode ? [m] : [];
          }
        };
        Expr.filter["ID"] = function(id) {
          var attrId = id.replace(runescape, funescape);
          return function(elem) {
            return elem.getAttribute("id") === attrId;
          };
        };
      } else {
        delete Expr.find["ID"];
        Expr.filter["ID"] = function(id) {
          var attrId = id.replace(runescape, funescape);
          return function(elem) {
            var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
            return node && node.value === attrId;
          };
        };
      }
      Expr.find["TAG"] = support.getElementsByTagName ? function(tag, context) {
        if (typeof context.getElementsByTagName !== "undefined") {
          return context.getElementsByTagName(tag);
        } else if (support.qsa) {
          return context.querySelectorAll(tag);
        }
      } : function(tag, context) {
        var elem,
            tmp = [],
            i = 0,
            results = context.getElementsByTagName(tag);
        if (tag === "*") {
          while ((elem = results[i++])) {
            if (elem.nodeType === 1) {
              tmp.push(elem);
            }
          }
          return tmp;
        }
        return results;
      };
      Expr.find["CLASS"] = support.getElementsByClassName && function(className, context) {
        if (documentIsHTML) {
          return context.getElementsByClassName(className);
        }
      };
      rbuggyMatches = [];
      rbuggyQSA = [];
      if ((support.qsa = rnative.test(doc.querySelectorAll))) {
        assert(function(div) {
          docElem.appendChild(div).innerHTML = "<a id='" + expando + "'></a>" + "<select id='" + expando + "-\f]' msallowcapture=''>" + "<option selected=''></option></select>";
          if (div.querySelectorAll("[msallowcapture^='']").length) {
            rbuggyQSA.push("[*^$]=" + whitespace + "*(?:''|\"\")");
          }
          if (!div.querySelectorAll("[selected]").length) {
            rbuggyQSA.push("\\[" + whitespace + "*(?:value|" + booleans + ")");
          }
          if (!div.querySelectorAll("[id~=" + expando + "-]").length) {
            rbuggyQSA.push("~=");
          }
          if (!div.querySelectorAll(":checked").length) {
            rbuggyQSA.push(":checked");
          }
          if (!div.querySelectorAll("a#" + expando + "+*").length) {
            rbuggyQSA.push(".#.+[+~]");
          }
        });
        assert(function(div) {
          var input = doc.createElement("input");
          input.setAttribute("type", "hidden");
          div.appendChild(input).setAttribute("name", "D");
          if (div.querySelectorAll("[name=d]").length) {
            rbuggyQSA.push("name" + whitespace + "*[*^$|!~]?=");
          }
          if (!div.querySelectorAll(":enabled").length) {
            rbuggyQSA.push(":enabled", ":disabled");
          }
          div.querySelectorAll("*,:x");
          rbuggyQSA.push(",.*:");
        });
      }
      if ((support.matchesSelector = rnative.test((matches = docElem.matches || docElem.webkitMatchesSelector || docElem.mozMatchesSelector || docElem.oMatchesSelector || docElem.msMatchesSelector)))) {
        assert(function(div) {
          support.disconnectedMatch = matches.call(div, "div");
          matches.call(div, "[s!='']:x");
          rbuggyMatches.push("!=", pseudos);
        });
      }
      rbuggyQSA = rbuggyQSA.length && new RegExp(rbuggyQSA.join("|"));
      rbuggyMatches = rbuggyMatches.length && new RegExp(rbuggyMatches.join("|"));
      hasCompare = rnative.test(docElem.compareDocumentPosition);
      contains = hasCompare || rnative.test(docElem.contains) ? function(a, b) {
        var adown = a.nodeType === 9 ? a.documentElement : a,
            bup = b && b.parentNode;
        return a === bup || !!(bup && bup.nodeType === 1 && (adown.contains ? adown.contains(bup) : a.compareDocumentPosition && a.compareDocumentPosition(bup) & 16));
      } : function(a, b) {
        if (b) {
          while ((b = b.parentNode)) {
            if (b === a) {
              return true;
            }
          }
        }
        return false;
      };
      sortOrder = hasCompare ? function(a, b) {
        if (a === b) {
          hasDuplicate = true;
          return 0;
        }
        var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
        if (compare) {
          return compare;
        }
        compare = (a.ownerDocument || a) === (b.ownerDocument || b) ? a.compareDocumentPosition(b) : 1;
        if (compare & 1 || (!support.sortDetached && b.compareDocumentPosition(a) === compare)) {
          if (a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a)) {
            return -1;
          }
          if (b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b)) {
            return 1;
          }
          return sortInput ? (indexOf(sortInput, a) - indexOf(sortInput, b)) : 0;
        }
        return compare & 4 ? -1 : 1;
      } : function(a, b) {
        if (a === b) {
          hasDuplicate = true;
          return 0;
        }
        var cur,
            i = 0,
            aup = a.parentNode,
            bup = b.parentNode,
            ap = [a],
            bp = [b];
        if (!aup || !bup) {
          return a === doc ? -1 : b === doc ? 1 : aup ? -1 : bup ? 1 : sortInput ? (indexOf(sortInput, a) - indexOf(sortInput, b)) : 0;
        } else if (aup === bup) {
          return siblingCheck(a, b);
        }
        cur = a;
        while ((cur = cur.parentNode)) {
          ap.unshift(cur);
        }
        cur = b;
        while ((cur = cur.parentNode)) {
          bp.unshift(cur);
        }
        while (ap[i] === bp[i]) {
          i++;
        }
        return i ? siblingCheck(ap[i], bp[i]) : ap[i] === preferredDoc ? -1 : bp[i] === preferredDoc ? 1 : 0;
      };
      return doc;
    };
    Sizzle.matches = function(expr, elements) {
      return Sizzle(expr, null, null, elements);
    };
    Sizzle.matchesSelector = function(elem, expr) {
      if ((elem.ownerDocument || elem) !== document) {
        setDocument(elem);
      }
      expr = expr.replace(rattributeQuotes, "='$1']");
      if (support.matchesSelector && documentIsHTML && (!rbuggyMatches || !rbuggyMatches.test(expr)) && (!rbuggyQSA || !rbuggyQSA.test(expr))) {
        try {
          var ret = matches.call(elem, expr);
          if (ret || support.disconnectedMatch || elem.document && elem.document.nodeType !== 11) {
            return ret;
          }
        } catch (e) {}
      }
      return Sizzle(expr, document, null, [elem]).length > 0;
    };
    Sizzle.contains = function(context, elem) {
      if ((context.ownerDocument || context) !== document) {
        setDocument(context);
      }
      return contains(context, elem);
    };
    Sizzle.attr = function(elem, name) {
      if ((elem.ownerDocument || elem) !== document) {
        setDocument(elem);
      }
      var fn = Expr.attrHandle[name.toLowerCase()],
          val = fn && hasOwn.call(Expr.attrHandle, name.toLowerCase()) ? fn(elem, name, !documentIsHTML) : undefined;
      return val !== undefined ? val : support.attributes || !documentIsHTML ? elem.getAttribute(name) : (val = elem.getAttributeNode(name)) && val.specified ? val.value : null;
    };
    Sizzle.error = function(msg) {
      throw new Error("Syntax error, unrecognized expression: " + msg);
    };
    Sizzle.uniqueSort = function(results) {
      var elem,
          duplicates = [],
          j = 0,
          i = 0;
      hasDuplicate = !support.detectDuplicates;
      sortInput = !support.sortStable && results.slice(0);
      results.sort(sortOrder);
      if (hasDuplicate) {
        while ((elem = results[i++])) {
          if (elem === results[i]) {
            j = duplicates.push(i);
          }
        }
        while (j--) {
          results.splice(duplicates[j], 1);
        }
      }
      sortInput = null;
      return results;
    };
    getText = Sizzle.getText = function(elem) {
      var node,
          ret = "",
          i = 0,
          nodeType = elem.nodeType;
      if (!nodeType) {
        while ((node = elem[i++])) {
          ret += getText(node);
        }
      } else if (nodeType === 1 || nodeType === 9 || nodeType === 11) {
        if (typeof elem.textContent === "string") {
          return elem.textContent;
        } else {
          for (elem = elem.firstChild; elem; elem = elem.nextSibling) {
            ret += getText(elem);
          }
        }
      } else if (nodeType === 3 || nodeType === 4) {
        return elem.nodeValue;
      }
      return ret;
    };
    Expr = Sizzle.selectors = {
      cacheLength: 50,
      createPseudo: markFunction,
      match: matchExpr,
      attrHandle: {},
      find: {},
      relative: {
        ">": {
          dir: "parentNode",
          first: true
        },
        " ": {dir: "parentNode"},
        "+": {
          dir: "previousSibling",
          first: true
        },
        "~": {dir: "previousSibling"}
      },
      preFilter: {
        "ATTR": function(match) {
          match[1] = match[1].replace(runescape, funescape);
          match[3] = (match[3] || match[4] || match[5] || "").replace(runescape, funescape);
          if (match[2] === "~=") {
            match[3] = " " + match[3] + " ";
          }
          return match.slice(0, 4);
        },
        "CHILD": function(match) {
          match[1] = match[1].toLowerCase();
          if (match[1].slice(0, 3) === "nth") {
            if (!match[3]) {
              Sizzle.error(match[0]);
            }
            match[4] = +(match[4] ? match[5] + (match[6] || 1) : 2 * (match[3] === "even" || match[3] === "odd"));
            match[5] = +((match[7] + match[8]) || match[3] === "odd");
          } else if (match[3]) {
            Sizzle.error(match[0]);
          }
          return match;
        },
        "PSEUDO": function(match) {
          var excess,
              unquoted = !match[6] && match[2];
          if (matchExpr["CHILD"].test(match[0])) {
            return null;
          }
          if (match[3]) {
            match[2] = match[4] || match[5] || "";
          } else if (unquoted && rpseudo.test(unquoted) && (excess = tokenize(unquoted, true)) && (excess = unquoted.indexOf(")", unquoted.length - excess) - unquoted.length)) {
            match[0] = match[0].slice(0, excess);
            match[2] = unquoted.slice(0, excess);
          }
          return match.slice(0, 3);
        }
      },
      filter: {
        "TAG": function(nodeNameSelector) {
          var nodeName = nodeNameSelector.replace(runescape, funescape).toLowerCase();
          return nodeNameSelector === "*" ? function() {
            return true;
          } : function(elem) {
            return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
          };
        },
        "CLASS": function(className) {
          var pattern = classCache[className + " "];
          return pattern || (pattern = new RegExp("(^|" + whitespace + ")" + className + "(" + whitespace + "|$)")) && classCache(className, function(elem) {
            return pattern.test(typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "");
          });
        },
        "ATTR": function(name, operator, check) {
          return function(elem) {
            var result = Sizzle.attr(elem, name);
            if (result == null) {
              return operator === "!=";
            }
            if (!operator) {
              return true;
            }
            result += "";
            return operator === "=" ? result === check : operator === "!=" ? result !== check : operator === "^=" ? check && result.indexOf(check) === 0 : operator === "*=" ? check && result.indexOf(check) > -1 : operator === "$=" ? check && result.slice(-check.length) === check : operator === "~=" ? (" " + result.replace(rwhitespace, " ") + " ").indexOf(check) > -1 : operator === "|=" ? result === check || result.slice(0, check.length + 1) === check + "-" : false;
          };
        },
        "CHILD": function(type, what, argument, first, last) {
          var simple = type.slice(0, 3) !== "nth",
              forward = type.slice(-4) !== "last",
              ofType = what === "of-type";
          return first === 1 && last === 0 ? function(elem) {
            return !!elem.parentNode;
          } : function(elem, context, xml) {
            var cache,
                outerCache,
                node,
                diff,
                nodeIndex,
                start,
                dir = simple !== forward ? "nextSibling" : "previousSibling",
                parent = elem.parentNode,
                name = ofType && elem.nodeName.toLowerCase(),
                useCache = !xml && !ofType;
            if (parent) {
              if (simple) {
                while (dir) {
                  node = elem;
                  while ((node = node[dir])) {
                    if (ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1) {
                      return false;
                    }
                  }
                  start = dir = type === "only" && !start && "nextSibling";
                }
                return true;
              }
              start = [forward ? parent.firstChild : parent.lastChild];
              if (forward && useCache) {
                outerCache = parent[expando] || (parent[expando] = {});
                cache = outerCache[type] || [];
                nodeIndex = cache[0] === dirruns && cache[1];
                diff = cache[0] === dirruns && cache[2];
                node = nodeIndex && parent.childNodes[nodeIndex];
                while ((node = ++nodeIndex && node && node[dir] || (diff = nodeIndex = 0) || start.pop())) {
                  if (node.nodeType === 1 && ++diff && node === elem) {
                    outerCache[type] = [dirruns, nodeIndex, diff];
                    break;
                  }
                }
              } else if (useCache && (cache = (elem[expando] || (elem[expando] = {}))[type]) && cache[0] === dirruns) {
                diff = cache[1];
              } else {
                while ((node = ++nodeIndex && node && node[dir] || (diff = nodeIndex = 0) || start.pop())) {
                  if ((ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1) && ++diff) {
                    if (useCache) {
                      (node[expando] || (node[expando] = {}))[type] = [dirruns, diff];
                    }
                    if (node === elem) {
                      break;
                    }
                  }
                }
              }
              diff -= last;
              return diff === first || (diff % first === 0 && diff / first >= 0);
            }
          };
        },
        "PSEUDO": function(pseudo, argument) {
          var args,
              fn = Expr.pseudos[pseudo] || Expr.setFilters[pseudo.toLowerCase()] || Sizzle.error("unsupported pseudo: " + pseudo);
          if (fn[expando]) {
            return fn(argument);
          }
          if (fn.length > 1) {
            args = [pseudo, pseudo, "", argument];
            return Expr.setFilters.hasOwnProperty(pseudo.toLowerCase()) ? markFunction(function(seed, matches) {
              var idx,
                  matched = fn(seed, argument),
                  i = matched.length;
              while (i--) {
                idx = indexOf(seed, matched[i]);
                seed[idx] = !(matches[idx] = matched[i]);
              }
            }) : function(elem) {
              return fn(elem, 0, args);
            };
          }
          return fn;
        }
      },
      pseudos: {
        "not": markFunction(function(selector) {
          var input = [],
              results = [],
              matcher = compile(selector.replace(rtrim, "$1"));
          return matcher[expando] ? markFunction(function(seed, matches, context, xml) {
            var elem,
                unmatched = matcher(seed, null, xml, []),
                i = seed.length;
            while (i--) {
              if ((elem = unmatched[i])) {
                seed[i] = !(matches[i] = elem);
              }
            }
          }) : function(elem, context, xml) {
            input[0] = elem;
            matcher(input, null, xml, results);
            input[0] = null;
            return !results.pop();
          };
        }),
        "has": markFunction(function(selector) {
          return function(elem) {
            return Sizzle(selector, elem).length > 0;
          };
        }),
        "contains": markFunction(function(text) {
          text = text.replace(runescape, funescape);
          return function(elem) {
            return (elem.textContent || elem.innerText || getText(elem)).indexOf(text) > -1;
          };
        }),
        "lang": markFunction(function(lang) {
          if (!ridentifier.test(lang || "")) {
            Sizzle.error("unsupported lang: " + lang);
          }
          lang = lang.replace(runescape, funescape).toLowerCase();
          return function(elem) {
            var elemLang;
            do {
              if ((elemLang = documentIsHTML ? elem.lang : elem.getAttribute("xml:lang") || elem.getAttribute("lang"))) {
                elemLang = elemLang.toLowerCase();
                return elemLang === lang || elemLang.indexOf(lang + "-") === 0;
              }
            } while ((elem = elem.parentNode) && elem.nodeType === 1);
            return false;
          };
        }),
        "target": function(elem) {
          var hash = window.location && window.location.hash;
          return hash && hash.slice(1) === elem.id;
        },
        "root": function(elem) {
          return elem === docElem;
        },
        "focus": function(elem) {
          return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
        },
        "enabled": function(elem) {
          return elem.disabled === false;
        },
        "disabled": function(elem) {
          return elem.disabled === true;
        },
        "checked": function(elem) {
          var nodeName = elem.nodeName.toLowerCase();
          return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
        },
        "selected": function(elem) {
          if (elem.parentNode) {
            elem.parentNode.selectedIndex;
          }
          return elem.selected === true;
        },
        "empty": function(elem) {
          for (elem = elem.firstChild; elem; elem = elem.nextSibling) {
            if (elem.nodeType < 6) {
              return false;
            }
          }
          return true;
        },
        "parent": function(elem) {
          return !Expr.pseudos["empty"](elem);
        },
        "header": function(elem) {
          return rheader.test(elem.nodeName);
        },
        "input": function(elem) {
          return rinputs.test(elem.nodeName);
        },
        "button": function(elem) {
          var name = elem.nodeName.toLowerCase();
          return name === "input" && elem.type === "button" || name === "button";
        },
        "text": function(elem) {
          var attr;
          return elem.nodeName.toLowerCase() === "input" && elem.type === "text" && ((attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text");
        },
        "first": createPositionalPseudo(function() {
          return [0];
        }),
        "last": createPositionalPseudo(function(matchIndexes, length) {
          return [length - 1];
        }),
        "eq": createPositionalPseudo(function(matchIndexes, length, argument) {
          return [argument < 0 ? argument + length : argument];
        }),
        "even": createPositionalPseudo(function(matchIndexes, length) {
          var i = 0;
          for (; i < length; i += 2) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        }),
        "odd": createPositionalPseudo(function(matchIndexes, length) {
          var i = 1;
          for (; i < length; i += 2) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        }),
        "lt": createPositionalPseudo(function(matchIndexes, length, argument) {
          var i = argument < 0 ? argument + length : argument;
          for (; --i >= 0; ) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        }),
        "gt": createPositionalPseudo(function(matchIndexes, length, argument) {
          var i = argument < 0 ? argument + length : argument;
          for (; ++i < length; ) {
            matchIndexes.push(i);
          }
          return matchIndexes;
        })
      }
    };
    Expr.pseudos["nth"] = Expr.pseudos["eq"];
    for (i in {
      radio: true,
      checkbox: true,
      file: true,
      password: true,
      image: true
    }) {
      Expr.pseudos[i] = createInputPseudo(i);
    }
    for (i in {
      submit: true,
      reset: true
    }) {
      Expr.pseudos[i] = createButtonPseudo(i);
    }
    function setFilters() {}
    setFilters.prototype = Expr.filters = Expr.pseudos;
    Expr.setFilters = new setFilters();
    tokenize = Sizzle.tokenize = function(selector, parseOnly) {
      var matched,
          match,
          tokens,
          type,
          soFar,
          groups,
          preFilters,
          cached = tokenCache[selector + " "];
      if (cached) {
        return parseOnly ? 0 : cached.slice(0);
      }
      soFar = selector;
      groups = [];
      preFilters = Expr.preFilter;
      while (soFar) {
        if (!matched || (match = rcomma.exec(soFar))) {
          if (match) {
            soFar = soFar.slice(match[0].length) || soFar;
          }
          groups.push((tokens = []));
        }
        matched = false;
        if ((match = rcombinators.exec(soFar))) {
          matched = match.shift();
          tokens.push({
            value: matched,
            type: match[0].replace(rtrim, " ")
          });
          soFar = soFar.slice(matched.length);
        }
        for (type in Expr.filter) {
          if ((match = matchExpr[type].exec(soFar)) && (!preFilters[type] || (match = preFilters[type](match)))) {
            matched = match.shift();
            tokens.push({
              value: matched,
              type: type,
              matches: match
            });
            soFar = soFar.slice(matched.length);
          }
        }
        if (!matched) {
          break;
        }
      }
      return parseOnly ? soFar.length : soFar ? Sizzle.error(selector) : tokenCache(selector, groups).slice(0);
    };
    function toSelector(tokens) {
      var i = 0,
          len = tokens.length,
          selector = "";
      for (; i < len; i++) {
        selector += tokens[i].value;
      }
      return selector;
    }
    function addCombinator(matcher, combinator, base) {
      var dir = combinator.dir,
          checkNonElements = base && dir === "parentNode",
          doneName = done++;
      return combinator.first ? function(elem, context, xml) {
        while ((elem = elem[dir])) {
          if (elem.nodeType === 1 || checkNonElements) {
            return matcher(elem, context, xml);
          }
        }
      } : function(elem, context, xml) {
        var oldCache,
            outerCache,
            newCache = [dirruns, doneName];
        if (xml) {
          while ((elem = elem[dir])) {
            if (elem.nodeType === 1 || checkNonElements) {
              if (matcher(elem, context, xml)) {
                return true;
              }
            }
          }
        } else {
          while ((elem = elem[dir])) {
            if (elem.nodeType === 1 || checkNonElements) {
              outerCache = elem[expando] || (elem[expando] = {});
              if ((oldCache = outerCache[dir]) && oldCache[0] === dirruns && oldCache[1] === doneName) {
                return (newCache[2] = oldCache[2]);
              } else {
                outerCache[dir] = newCache;
                if ((newCache[2] = matcher(elem, context, xml))) {
                  return true;
                }
              }
            }
          }
        }
      };
    }
    function elementMatcher(matchers) {
      return matchers.length > 1 ? function(elem, context, xml) {
        var i = matchers.length;
        while (i--) {
          if (!matchers[i](elem, context, xml)) {
            return false;
          }
        }
        return true;
      } : matchers[0];
    }
    function multipleContexts(selector, contexts, results) {
      var i = 0,
          len = contexts.length;
      for (; i < len; i++) {
        Sizzle(selector, contexts[i], results);
      }
      return results;
    }
    function condense(unmatched, map, filter, context, xml) {
      var elem,
          newUnmatched = [],
          i = 0,
          len = unmatched.length,
          mapped = map != null;
      for (; i < len; i++) {
        if ((elem = unmatched[i])) {
          if (!filter || filter(elem, context, xml)) {
            newUnmatched.push(elem);
            if (mapped) {
              map.push(i);
            }
          }
        }
      }
      return newUnmatched;
    }
    function setMatcher(preFilter, selector, matcher, postFilter, postFinder, postSelector) {
      if (postFilter && !postFilter[expando]) {
        postFilter = setMatcher(postFilter);
      }
      if (postFinder && !postFinder[expando]) {
        postFinder = setMatcher(postFinder, postSelector);
      }
      return markFunction(function(seed, results, context, xml) {
        var temp,
            i,
            elem,
            preMap = [],
            postMap = [],
            preexisting = results.length,
            elems = seed || multipleContexts(selector || "*", context.nodeType ? [context] : context, []),
            matcherIn = preFilter && (seed || !selector) ? condense(elems, preMap, preFilter, context, xml) : elems,
            matcherOut = matcher ? postFinder || (seed ? preFilter : preexisting || postFilter) ? [] : results : matcherIn;
        if (matcher) {
          matcher(matcherIn, matcherOut, context, xml);
        }
        if (postFilter) {
          temp = condense(matcherOut, postMap);
          postFilter(temp, [], context, xml);
          i = temp.length;
          while (i--) {
            if ((elem = temp[i])) {
              matcherOut[postMap[i]] = !(matcherIn[postMap[i]] = elem);
            }
          }
        }
        if (seed) {
          if (postFinder || preFilter) {
            if (postFinder) {
              temp = [];
              i = matcherOut.length;
              while (i--) {
                if ((elem = matcherOut[i])) {
                  temp.push((matcherIn[i] = elem));
                }
              }
              postFinder(null, (matcherOut = []), temp, xml);
            }
            i = matcherOut.length;
            while (i--) {
              if ((elem = matcherOut[i]) && (temp = postFinder ? indexOf(seed, elem) : preMap[i]) > -1) {
                seed[temp] = !(results[temp] = elem);
              }
            }
          }
        } else {
          matcherOut = condense(matcherOut === results ? matcherOut.splice(preexisting, matcherOut.length) : matcherOut);
          if (postFinder) {
            postFinder(null, results, matcherOut, xml);
          } else {
            push.apply(results, matcherOut);
          }
        }
      });
    }
    function matcherFromTokens(tokens) {
      var checkContext,
          matcher,
          j,
          len = tokens.length,
          leadingRelative = Expr.relative[tokens[0].type],
          implicitRelative = leadingRelative || Expr.relative[" "],
          i = leadingRelative ? 1 : 0,
          matchContext = addCombinator(function(elem) {
            return elem === checkContext;
          }, implicitRelative, true),
          matchAnyContext = addCombinator(function(elem) {
            return indexOf(checkContext, elem) > -1;
          }, implicitRelative, true),
          matchers = [function(elem, context, xml) {
            var ret = (!leadingRelative && (xml || context !== outermostContext)) || ((checkContext = context).nodeType ? matchContext(elem, context, xml) : matchAnyContext(elem, context, xml));
            checkContext = null;
            return ret;
          }];
      for (; i < len; i++) {
        if ((matcher = Expr.relative[tokens[i].type])) {
          matchers = [addCombinator(elementMatcher(matchers), matcher)];
        } else {
          matcher = Expr.filter[tokens[i].type].apply(null, tokens[i].matches);
          if (matcher[expando]) {
            j = ++i;
            for (; j < len; j++) {
              if (Expr.relative[tokens[j].type]) {
                break;
              }
            }
            return setMatcher(i > 1 && elementMatcher(matchers), i > 1 && toSelector(tokens.slice(0, i - 1).concat({value: tokens[i - 2].type === " " ? "*" : ""})).replace(rtrim, "$1"), matcher, i < j && matcherFromTokens(tokens.slice(i, j)), j < len && matcherFromTokens((tokens = tokens.slice(j))), j < len && toSelector(tokens));
          }
          matchers.push(matcher);
        }
      }
      return elementMatcher(matchers);
    }
    function matcherFromGroupMatchers(elementMatchers, setMatchers) {
      var bySet = setMatchers.length > 0,
          byElement = elementMatchers.length > 0,
          superMatcher = function(seed, context, xml, results, outermost) {
            var elem,
                j,
                matcher,
                matchedCount = 0,
                i = "0",
                unmatched = seed && [],
                setMatched = [],
                contextBackup = outermostContext,
                elems = seed || byElement && Expr.find["TAG"]("*", outermost),
                dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
                len = elems.length;
            if (outermost) {
              outermostContext = context !== document && context;
            }
            for (; i !== len && (elem = elems[i]) != null; i++) {
              if (byElement && elem) {
                j = 0;
                while ((matcher = elementMatchers[j++])) {
                  if (matcher(elem, context, xml)) {
                    results.push(elem);
                    break;
                  }
                }
                if (outermost) {
                  dirruns = dirrunsUnique;
                }
              }
              if (bySet) {
                if ((elem = !matcher && elem)) {
                  matchedCount--;
                }
                if (seed) {
                  unmatched.push(elem);
                }
              }
            }
            matchedCount += i;
            if (bySet && i !== matchedCount) {
              j = 0;
              while ((matcher = setMatchers[j++])) {
                matcher(unmatched, setMatched, context, xml);
              }
              if (seed) {
                if (matchedCount > 0) {
                  while (i--) {
                    if (!(unmatched[i] || setMatched[i])) {
                      setMatched[i] = pop.call(results);
                    }
                  }
                }
                setMatched = condense(setMatched);
              }
              push.apply(results, setMatched);
              if (outermost && !seed && setMatched.length > 0 && (matchedCount + setMatchers.length) > 1) {
                Sizzle.uniqueSort(results);
              }
            }
            if (outermost) {
              dirruns = dirrunsUnique;
              outermostContext = contextBackup;
            }
            return unmatched;
          };
      return bySet ? markFunction(superMatcher) : superMatcher;
    }
    compile = Sizzle.compile = function(selector, match) {
      var i,
          setMatchers = [],
          elementMatchers = [],
          cached = compilerCache[selector + " "];
      if (!cached) {
        if (!match) {
          match = tokenize(selector);
        }
        i = match.length;
        while (i--) {
          cached = matcherFromTokens(match[i]);
          if (cached[expando]) {
            setMatchers.push(cached);
          } else {
            elementMatchers.push(cached);
          }
        }
        cached = compilerCache(selector, matcherFromGroupMatchers(elementMatchers, setMatchers));
        cached.selector = selector;
      }
      return cached;
    };
    select = Sizzle.select = function(selector, context, results, seed) {
      var i,
          tokens,
          token,
          type,
          find,
          compiled = typeof selector === "function" && selector,
          match = !seed && tokenize((selector = compiled.selector || selector));
      results = results || [];
      if (match.length === 1) {
        tokens = match[0] = match[0].slice(0);
        if (tokens.length > 2 && (token = tokens[0]).type === "ID" && support.getById && context.nodeType === 9 && documentIsHTML && Expr.relative[tokens[1].type]) {
          context = (Expr.find["ID"](token.matches[0].replace(runescape, funescape), context) || [])[0];
          if (!context) {
            return results;
          } else if (compiled) {
            context = context.parentNode;
          }
          selector = selector.slice(tokens.shift().value.length);
        }
        i = matchExpr["needsContext"].test(selector) ? 0 : tokens.length;
        while (i--) {
          token = tokens[i];
          if (Expr.relative[(type = token.type)]) {
            break;
          }
          if ((find = Expr.find[type])) {
            if ((seed = find(token.matches[0].replace(runescape, funescape), rsibling.test(tokens[0].type) && testContext(context.parentNode) || context))) {
              tokens.splice(i, 1);
              selector = seed.length && toSelector(tokens);
              if (!selector) {
                push.apply(results, seed);
                return results;
              }
              break;
            }
          }
        }
      }
      (compiled || compile(selector, match))(seed, context, !documentIsHTML, results, rsibling.test(selector) && testContext(context.parentNode) || context);
      return results;
    };
    support.sortStable = expando.split("").sort(sortOrder).join("") === expando;
    support.detectDuplicates = !!hasDuplicate;
    setDocument();
    support.sortDetached = assert(function(div1) {
      return div1.compareDocumentPosition(document.createElement("div")) & 1;
    });
    if (!assert(function(div) {
      div.innerHTML = "<a href='#'></a>";
      return div.firstChild.getAttribute("href") === "#";
    })) {
      addHandle("type|href|height|width", function(elem, name, isXML) {
        if (!isXML) {
          return elem.getAttribute(name, name.toLowerCase() === "type" ? 1 : 2);
        }
      });
    }
    if (!support.attributes || !assert(function(div) {
      div.innerHTML = "<input/>";
      div.firstChild.setAttribute("value", "");
      return div.firstChild.getAttribute("value") === "";
    })) {
      addHandle("value", function(elem, name, isXML) {
        if (!isXML && elem.nodeName.toLowerCase() === "input") {
          return elem.defaultValue;
        }
      });
    }
    if (!assert(function(div) {
      return div.getAttribute("disabled") == null;
    })) {
      addHandle(booleans, function(elem, name, isXML) {
        var val;
        if (!isXML) {
          return elem[name] === true ? name.toLowerCase() : (val = elem.getAttributeNode(name)) && val.specified ? val.value : null;
        }
      });
    }
    return Sizzle;
  })(window);
  jQuery.find = Sizzle;
  jQuery.expr = Sizzle.selectors;
  jQuery.expr[":"] = jQuery.expr.pseudos;
  jQuery.unique = Sizzle.uniqueSort;
  jQuery.text = Sizzle.getText;
  jQuery.isXMLDoc = Sizzle.isXML;
  jQuery.contains = Sizzle.contains;
  var rneedsContext = jQuery.expr.match.needsContext;
  var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);
  var risSimple = /^.[^:#\[\.,]*$/;
  function winnow(elements, qualifier, not) {
    if (jQuery.isFunction(qualifier)) {
      return jQuery.grep(elements, function(elem, i) {
        return !!qualifier.call(elem, i, elem) !== not;
      });
    }
    if (qualifier.nodeType) {
      return jQuery.grep(elements, function(elem) {
        return (elem === qualifier) !== not;
      });
    }
    if (typeof qualifier === "string") {
      if (risSimple.test(qualifier)) {
        return jQuery.filter(qualifier, elements, not);
      }
      qualifier = jQuery.filter(qualifier, elements);
    }
    return jQuery.grep(elements, function(elem) {
      return (indexOf.call(qualifier, elem) >= 0) !== not;
    });
  }
  jQuery.filter = function(expr, elems, not) {
    var elem = elems[0];
    if (not) {
      expr = ":not(" + expr + ")";
    }
    return elems.length === 1 && elem.nodeType === 1 ? jQuery.find.matchesSelector(elem, expr) ? [elem] : [] : jQuery.find.matches(expr, jQuery.grep(elems, function(elem) {
      return elem.nodeType === 1;
    }));
  };
  jQuery.fn.extend({
    find: function(selector) {
      var i,
          len = this.length,
          ret = [],
          self = this;
      if (typeof selector !== "string") {
        return this.pushStack(jQuery(selector).filter(function() {
          for (i = 0; i < len; i++) {
            if (jQuery.contains(self[i], this)) {
              return true;
            }
          }
        }));
      }
      for (i = 0; i < len; i++) {
        jQuery.find(selector, self[i], ret);
      }
      ret = this.pushStack(len > 1 ? jQuery.unique(ret) : ret);
      ret.selector = this.selector ? this.selector + " " + selector : selector;
      return ret;
    },
    filter: function(selector) {
      return this.pushStack(winnow(this, selector || [], false));
    },
    not: function(selector) {
      return this.pushStack(winnow(this, selector || [], true));
    },
    is: function(selector) {
      return !!winnow(this, typeof selector === "string" && rneedsContext.test(selector) ? jQuery(selector) : selector || [], false).length;
    }
  });
  var rootjQuery,
      rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,
      init = jQuery.fn.init = function(selector, context) {
        var match,
            elem;
        if (!selector) {
          return this;
        }
        if (typeof selector === "string") {
          if (selector[0] === "<" && selector[selector.length - 1] === ">" && selector.length >= 3) {
            match = [null, selector, null];
          } else {
            match = rquickExpr.exec(selector);
          }
          if (match && (match[1] || !context)) {
            if (match[1]) {
              context = context instanceof jQuery ? context[0] : context;
              jQuery.merge(this, jQuery.parseHTML(match[1], context && context.nodeType ? context.ownerDocument || context : document, true));
              if (rsingleTag.test(match[1]) && jQuery.isPlainObject(context)) {
                for (match in context) {
                  if (jQuery.isFunction(this[match])) {
                    this[match](context[match]);
                  } else {
                    this.attr(match, context[match]);
                  }
                }
              }
              return this;
            } else {
              elem = document.getElementById(match[2]);
              if (elem && elem.parentNode) {
                this.length = 1;
                this[0] = elem;
              }
              this.context = document;
              this.selector = selector;
              return this;
            }
          } else if (!context || context.jquery) {
            return (context || rootjQuery).find(selector);
          } else {
            return this.constructor(context).find(selector);
          }
        } else if (selector.nodeType) {
          this.context = this[0] = selector;
          this.length = 1;
          return this;
        } else if (jQuery.isFunction(selector)) {
          return typeof rootjQuery.ready !== "undefined" ? rootjQuery.ready(selector) : selector(jQuery);
        }
        if (selector.selector !== undefined) {
          this.selector = selector.selector;
          this.context = selector.context;
        }
        return jQuery.makeArray(selector, this);
      };
  init.prototype = jQuery.fn;
  rootjQuery = jQuery(document);
  var rparentsprev = /^(?:parents|prev(?:Until|All))/,
      guaranteedUnique = {
        children: true,
        contents: true,
        next: true,
        prev: true
      };
  jQuery.extend({
    dir: function(elem, dir, until) {
      var matched = [],
          truncate = until !== undefined;
      while ((elem = elem[dir]) && elem.nodeType !== 9) {
        if (elem.nodeType === 1) {
          if (truncate && jQuery(elem).is(until)) {
            break;
          }
          matched.push(elem);
        }
      }
      return matched;
    },
    sibling: function(n, elem) {
      var matched = [];
      for (; n; n = n.nextSibling) {
        if (n.nodeType === 1 && n !== elem) {
          matched.push(n);
        }
      }
      return matched;
    }
  });
  jQuery.fn.extend({
    has: function(target) {
      var targets = jQuery(target, this),
          l = targets.length;
      return this.filter(function() {
        var i = 0;
        for (; i < l; i++) {
          if (jQuery.contains(this, targets[i])) {
            return true;
          }
        }
      });
    },
    closest: function(selectors, context) {
      var cur,
          i = 0,
          l = this.length,
          matched = [],
          pos = rneedsContext.test(selectors) || typeof selectors !== "string" ? jQuery(selectors, context || this.context) : 0;
      for (; i < l; i++) {
        for (cur = this[i]; cur && cur !== context; cur = cur.parentNode) {
          if (cur.nodeType < 11 && (pos ? pos.index(cur) > -1 : cur.nodeType === 1 && jQuery.find.matchesSelector(cur, selectors))) {
            matched.push(cur);
            break;
          }
        }
      }
      return this.pushStack(matched.length > 1 ? jQuery.unique(matched) : matched);
    },
    index: function(elem) {
      if (!elem) {
        return (this[0] && this[0].parentNode) ? this.first().prevAll().length : -1;
      }
      if (typeof elem === "string") {
        return indexOf.call(jQuery(elem), this[0]);
      }
      return indexOf.call(this, elem.jquery ? elem[0] : elem);
    },
    add: function(selector, context) {
      return this.pushStack(jQuery.unique(jQuery.merge(this.get(), jQuery(selector, context))));
    },
    addBack: function(selector) {
      return this.add(selector == null ? this.prevObject : this.prevObject.filter(selector));
    }
  });
  function sibling(cur, dir) {
    while ((cur = cur[dir]) && cur.nodeType !== 1) {}
    return cur;
  }
  jQuery.each({
    parent: function(elem) {
      var parent = elem.parentNode;
      return parent && parent.nodeType !== 11 ? parent : null;
    },
    parents: function(elem) {
      return jQuery.dir(elem, "parentNode");
    },
    parentsUntil: function(elem, i, until) {
      return jQuery.dir(elem, "parentNode", until);
    },
    next: function(elem) {
      return sibling(elem, "nextSibling");
    },
    prev: function(elem) {
      return sibling(elem, "previousSibling");
    },
    nextAll: function(elem) {
      return jQuery.dir(elem, "nextSibling");
    },
    prevAll: function(elem) {
      return jQuery.dir(elem, "previousSibling");
    },
    nextUntil: function(elem, i, until) {
      return jQuery.dir(elem, "nextSibling", until);
    },
    prevUntil: function(elem, i, until) {
      return jQuery.dir(elem, "previousSibling", until);
    },
    siblings: function(elem) {
      return jQuery.sibling((elem.parentNode || {}).firstChild, elem);
    },
    children: function(elem) {
      return jQuery.sibling(elem.firstChild);
    },
    contents: function(elem) {
      return elem.contentDocument || jQuery.merge([], elem.childNodes);
    }
  }, function(name, fn) {
    jQuery.fn[name] = function(until, selector) {
      var matched = jQuery.map(this, fn, until);
      if (name.slice(-5) !== "Until") {
        selector = until;
      }
      if (selector && typeof selector === "string") {
        matched = jQuery.filter(selector, matched);
      }
      if (this.length > 1) {
        if (!guaranteedUnique[name]) {
          jQuery.unique(matched);
        }
        if (rparentsprev.test(name)) {
          matched.reverse();
        }
      }
      return this.pushStack(matched);
    };
  });
  var rnotwhite = (/\S+/g);
  var optionsCache = {};
  function createOptions(options) {
    var object = optionsCache[options] = {};
    jQuery.each(options.match(rnotwhite) || [], function(_, flag) {
      object[flag] = true;
    });
    return object;
  }
  jQuery.Callbacks = function(options) {
    options = typeof options === "string" ? (optionsCache[options] || createOptions(options)) : jQuery.extend({}, options);
    var memory,
        fired,
        firing,
        firingStart,
        firingLength,
        firingIndex,
        list = [],
        stack = !options.once && [],
        fire = function(data) {
          memory = options.memory && data;
          fired = true;
          firingIndex = firingStart || 0;
          firingStart = 0;
          firingLength = list.length;
          firing = true;
          for (; list && firingIndex < firingLength; firingIndex++) {
            if (list[firingIndex].apply(data[0], data[1]) === false && options.stopOnFalse) {
              memory = false;
              break;
            }
          }
          firing = false;
          if (list) {
            if (stack) {
              if (stack.length) {
                fire(stack.shift());
              }
            } else if (memory) {
              list = [];
            } else {
              self.disable();
            }
          }
        },
        self = {
          add: function() {
            if (list) {
              var start = list.length;
              (function add(args) {
                jQuery.each(args, function(_, arg) {
                  var type = jQuery.type(arg);
                  if (type === "function") {
                    if (!options.unique || !self.has(arg)) {
                      list.push(arg);
                    }
                  } else if (arg && arg.length && type !== "string") {
                    add(arg);
                  }
                });
              })(arguments);
              if (firing) {
                firingLength = list.length;
              } else if (memory) {
                firingStart = start;
                fire(memory);
              }
            }
            return this;
          },
          remove: function() {
            if (list) {
              jQuery.each(arguments, function(_, arg) {
                var index;
                while ((index = jQuery.inArray(arg, list, index)) > -1) {
                  list.splice(index, 1);
                  if (firing) {
                    if (index <= firingLength) {
                      firingLength--;
                    }
                    if (index <= firingIndex) {
                      firingIndex--;
                    }
                  }
                }
              });
            }
            return this;
          },
          has: function(fn) {
            return fn ? jQuery.inArray(fn, list) > -1 : !!(list && list.length);
          },
          empty: function() {
            list = [];
            firingLength = 0;
            return this;
          },
          disable: function() {
            list = stack = memory = undefined;
            return this;
          },
          disabled: function() {
            return !list;
          },
          lock: function() {
            stack = undefined;
            if (!memory) {
              self.disable();
            }
            return this;
          },
          locked: function() {
            return !stack;
          },
          fireWith: function(context, args) {
            if (list && (!fired || stack)) {
              args = args || [];
              args = [context, args.slice ? args.slice() : args];
              if (firing) {
                stack.push(args);
              } else {
                fire(args);
              }
            }
            return this;
          },
          fire: function() {
            self.fireWith(this, arguments);
            return this;
          },
          fired: function() {
            return !!fired;
          }
        };
    return self;
  };
  jQuery.extend({
    Deferred: function(func) {
      var tuples = [["resolve", "done", jQuery.Callbacks("once memory"), "resolved"], ["reject", "fail", jQuery.Callbacks("once memory"), "rejected"], ["notify", "progress", jQuery.Callbacks("memory")]],
          state = "pending",
          promise = {
            state: function() {
              return state;
            },
            always: function() {
              deferred.done(arguments).fail(arguments);
              return this;
            },
            then: function() {
              var fns = arguments;
              return jQuery.Deferred(function(newDefer) {
                jQuery.each(tuples, function(i, tuple) {
                  var fn = jQuery.isFunction(fns[i]) && fns[i];
                  deferred[tuple[1]](function() {
                    var returned = fn && fn.apply(this, arguments);
                    if (returned && jQuery.isFunction(returned.promise)) {
                      returned.promise().done(newDefer.resolve).fail(newDefer.reject).progress(newDefer.notify);
                    } else {
                      newDefer[tuple[0] + "With"](this === promise ? newDefer.promise() : this, fn ? [returned] : arguments);
                    }
                  });
                });
                fns = null;
              }).promise();
            },
            promise: function(obj) {
              return obj != null ? jQuery.extend(obj, promise) : promise;
            }
          },
          deferred = {};
      promise.pipe = promise.then;
      jQuery.each(tuples, function(i, tuple) {
        var list = tuple[2],
            stateString = tuple[3];
        promise[tuple[1]] = list.add;
        if (stateString) {
          list.add(function() {
            state = stateString;
          }, tuples[i ^ 1][2].disable, tuples[2][2].lock);
        }
        deferred[tuple[0]] = function() {
          deferred[tuple[0] + "With"](this === deferred ? promise : this, arguments);
          return this;
        };
        deferred[tuple[0] + "With"] = list.fireWith;
      });
      promise.promise(deferred);
      if (func) {
        func.call(deferred, deferred);
      }
      return deferred;
    },
    when: function(subordinate) {
      var i = 0,
          resolveValues = slice.call(arguments),
          length = resolveValues.length,
          remaining = length !== 1 || (subordinate && jQuery.isFunction(subordinate.promise)) ? length : 0,
          deferred = remaining === 1 ? subordinate : jQuery.Deferred(),
          updateFunc = function(i, contexts, values) {
            return function(value) {
              contexts[i] = this;
              values[i] = arguments.length > 1 ? slice.call(arguments) : value;
              if (values === progressValues) {
                deferred.notifyWith(contexts, values);
              } else if (!(--remaining)) {
                deferred.resolveWith(contexts, values);
              }
            };
          },
          progressValues,
          progressContexts,
          resolveContexts;
      if (length > 1) {
        progressValues = new Array(length);
        progressContexts = new Array(length);
        resolveContexts = new Array(length);
        for (; i < length; i++) {
          if (resolveValues[i] && jQuery.isFunction(resolveValues[i].promise)) {
            resolveValues[i].promise().done(updateFunc(i, resolveContexts, resolveValues)).fail(deferred.reject).progress(updateFunc(i, progressContexts, progressValues));
          } else {
            --remaining;
          }
        }
      }
      if (!remaining) {
        deferred.resolveWith(resolveContexts, resolveValues);
      }
      return deferred.promise();
    }
  });
  var readyList;
  jQuery.fn.ready = function(fn) {
    jQuery.ready.promise().done(fn);
    return this;
  };
  jQuery.extend({
    isReady: false,
    readyWait: 1,
    holdReady: function(hold) {
      if (hold) {
        jQuery.readyWait++;
      } else {
        jQuery.ready(true);
      }
    },
    ready: function(wait) {
      if (wait === true ? --jQuery.readyWait : jQuery.isReady) {
        return;
      }
      jQuery.isReady = true;
      if (wait !== true && --jQuery.readyWait > 0) {
        return;
      }
      readyList.resolveWith(document, [jQuery]);
      if (jQuery.fn.triggerHandler) {
        jQuery(document).triggerHandler("ready");
        jQuery(document).off("ready");
      }
    }
  });
  function completed() {
    document.removeEventListener("DOMContentLoaded", completed, false);
    window.removeEventListener("load", completed, false);
    jQuery.ready();
  }
  jQuery.ready.promise = function(obj) {
    if (!readyList) {
      readyList = jQuery.Deferred();
      if (document.readyState === "complete") {
        setTimeout(jQuery.ready);
      } else {
        document.addEventListener("DOMContentLoaded", completed, false);
        window.addEventListener("load", completed, false);
      }
    }
    return readyList.promise(obj);
  };
  jQuery.ready.promise();
  var access = jQuery.access = function(elems, fn, key, value, chainable, emptyGet, raw) {
    var i = 0,
        len = elems.length,
        bulk = key == null;
    if (jQuery.type(key) === "object") {
      chainable = true;
      for (i in key) {
        jQuery.access(elems, fn, i, key[i], true, emptyGet, raw);
      }
    } else if (value !== undefined) {
      chainable = true;
      if (!jQuery.isFunction(value)) {
        raw = true;
      }
      if (bulk) {
        if (raw) {
          fn.call(elems, value);
          fn = null;
        } else {
          bulk = fn;
          fn = function(elem, key, value) {
            return bulk.call(jQuery(elem), value);
          };
        }
      }
      if (fn) {
        for (; i < len; i++) {
          fn(elems[i], key, raw ? value : value.call(elems[i], i, fn(elems[i], key)));
        }
      }
    }
    return chainable ? elems : bulk ? fn.call(elems) : len ? fn(elems[0], key) : emptyGet;
  };
  jQuery.acceptData = function(owner) {
    return owner.nodeType === 1 || owner.nodeType === 9 || !(+owner.nodeType);
  };
  function Data() {
    Object.defineProperty(this.cache = {}, 0, {get: function() {
        return {};
      }});
    this.expando = jQuery.expando + Data.uid++;
  }
  Data.uid = 1;
  Data.accepts = jQuery.acceptData;
  Data.prototype = {
    key: function(owner) {
      if (!Data.accepts(owner)) {
        return 0;
      }
      var descriptor = {},
          unlock = owner[this.expando];
      if (!unlock) {
        unlock = Data.uid++;
        try {
          descriptor[this.expando] = {value: unlock};
          Object.defineProperties(owner, descriptor);
        } catch (e) {
          descriptor[this.expando] = unlock;
          jQuery.extend(owner, descriptor);
        }
      }
      if (!this.cache[unlock]) {
        this.cache[unlock] = {};
      }
      return unlock;
    },
    set: function(owner, data, value) {
      var prop,
          unlock = this.key(owner),
          cache = this.cache[unlock];
      if (typeof data === "string") {
        cache[data] = value;
      } else {
        if (jQuery.isEmptyObject(cache)) {
          jQuery.extend(this.cache[unlock], data);
        } else {
          for (prop in data) {
            cache[prop] = data[prop];
          }
        }
      }
      return cache;
    },
    get: function(owner, key) {
      var cache = this.cache[this.key(owner)];
      return key === undefined ? cache : cache[key];
    },
    access: function(owner, key, value) {
      var stored;
      if (key === undefined || ((key && typeof key === "string") && value === undefined)) {
        stored = this.get(owner, key);
        return stored !== undefined ? stored : this.get(owner, jQuery.camelCase(key));
      }
      this.set(owner, key, value);
      return value !== undefined ? value : key;
    },
    remove: function(owner, key) {
      var i,
          name,
          camel,
          unlock = this.key(owner),
          cache = this.cache[unlock];
      if (key === undefined) {
        this.cache[unlock] = {};
      } else {
        if (jQuery.isArray(key)) {
          name = key.concat(key.map(jQuery.camelCase));
        } else {
          camel = jQuery.camelCase(key);
          if (key in cache) {
            name = [key, camel];
          } else {
            name = camel;
            name = name in cache ? [name] : (name.match(rnotwhite) || []);
          }
        }
        i = name.length;
        while (i--) {
          delete cache[name[i]];
        }
      }
    },
    hasData: function(owner) {
      return !jQuery.isEmptyObject(this.cache[owner[this.expando]] || {});
    },
    discard: function(owner) {
      if (owner[this.expando]) {
        delete this.cache[owner[this.expando]];
      }
    }
  };
  var data_priv = new Data();
  var data_user = new Data();
  var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
      rmultiDash = /([A-Z])/g;
  function dataAttr(elem, key, data) {
    var name;
    if (data === undefined && elem.nodeType === 1) {
      name = "data-" + key.replace(rmultiDash, "-$1").toLowerCase();
      data = elem.getAttribute(name);
      if (typeof data === "string") {
        try {
          data = data === "true" ? true : data === "false" ? false : data === "null" ? null : +data + "" === data ? +data : rbrace.test(data) ? jQuery.parseJSON(data) : data;
        } catch (e) {}
        data_user.set(elem, key, data);
      } else {
        data = undefined;
      }
    }
    return data;
  }
  jQuery.extend({
    hasData: function(elem) {
      return data_user.hasData(elem) || data_priv.hasData(elem);
    },
    data: function(elem, name, data) {
      return data_user.access(elem, name, data);
    },
    removeData: function(elem, name) {
      data_user.remove(elem, name);
    },
    _data: function(elem, name, data) {
      return data_priv.access(elem, name, data);
    },
    _removeData: function(elem, name) {
      data_priv.remove(elem, name);
    }
  });
  jQuery.fn.extend({
    data: function(key, value) {
      var i,
          name,
          data,
          elem = this[0],
          attrs = elem && elem.attributes;
      if (key === undefined) {
        if (this.length) {
          data = data_user.get(elem);
          if (elem.nodeType === 1 && !data_priv.get(elem, "hasDataAttrs")) {
            i = attrs.length;
            while (i--) {
              if (attrs[i]) {
                name = attrs[i].name;
                if (name.indexOf("data-") === 0) {
                  name = jQuery.camelCase(name.slice(5));
                  dataAttr(elem, name, data[name]);
                }
              }
            }
            data_priv.set(elem, "hasDataAttrs", true);
          }
        }
        return data;
      }
      if (typeof key === "object") {
        return this.each(function() {
          data_user.set(this, key);
        });
      }
      return access(this, function(value) {
        var data,
            camelKey = jQuery.camelCase(key);
        if (elem && value === undefined) {
          data = data_user.get(elem, key);
          if (data !== undefined) {
            return data;
          }
          data = data_user.get(elem, camelKey);
          if (data !== undefined) {
            return data;
          }
          data = dataAttr(elem, camelKey, undefined);
          if (data !== undefined) {
            return data;
          }
          return;
        }
        this.each(function() {
          var data = data_user.get(this, camelKey);
          data_user.set(this, camelKey, value);
          if (key.indexOf("-") !== -1 && data !== undefined) {
            data_user.set(this, key, value);
          }
        });
      }, null, value, arguments.length > 1, null, true);
    },
    removeData: function(key) {
      return this.each(function() {
        data_user.remove(this, key);
      });
    }
  });
  jQuery.extend({
    queue: function(elem, type, data) {
      var queue;
      if (elem) {
        type = (type || "fx") + "queue";
        queue = data_priv.get(elem, type);
        if (data) {
          if (!queue || jQuery.isArray(data)) {
            queue = data_priv.access(elem, type, jQuery.makeArray(data));
          } else {
            queue.push(data);
          }
        }
        return queue || [];
      }
    },
    dequeue: function(elem, type) {
      type = type || "fx";
      var queue = jQuery.queue(elem, type),
          startLength = queue.length,
          fn = queue.shift(),
          hooks = jQuery._queueHooks(elem, type),
          next = function() {
            jQuery.dequeue(elem, type);
          };
      if (fn === "inprogress") {
        fn = queue.shift();
        startLength--;
      }
      if (fn) {
        if (type === "fx") {
          queue.unshift("inprogress");
        }
        delete hooks.stop;
        fn.call(elem, next, hooks);
      }
      if (!startLength && hooks) {
        hooks.empty.fire();
      }
    },
    _queueHooks: function(elem, type) {
      var key = type + "queueHooks";
      return data_priv.get(elem, key) || data_priv.access(elem, key, {empty: jQuery.Callbacks("once memory").add(function() {
          data_priv.remove(elem, [type + "queue", key]);
        })});
    }
  });
  jQuery.fn.extend({
    queue: function(type, data) {
      var setter = 2;
      if (typeof type !== "string") {
        data = type;
        type = "fx";
        setter--;
      }
      if (arguments.length < setter) {
        return jQuery.queue(this[0], type);
      }
      return data === undefined ? this : this.each(function() {
        var queue = jQuery.queue(this, type, data);
        jQuery._queueHooks(this, type);
        if (type === "fx" && queue[0] !== "inprogress") {
          jQuery.dequeue(this, type);
        }
      });
    },
    dequeue: function(type) {
      return this.each(function() {
        jQuery.dequeue(this, type);
      });
    },
    clearQueue: function(type) {
      return this.queue(type || "fx", []);
    },
    promise: function(type, obj) {
      var tmp,
          count = 1,
          defer = jQuery.Deferred(),
          elements = this,
          i = this.length,
          resolve = function() {
            if (!(--count)) {
              defer.resolveWith(elements, [elements]);
            }
          };
      if (typeof type !== "string") {
        obj = type;
        type = undefined;
      }
      type = type || "fx";
      while (i--) {
        tmp = data_priv.get(elements[i], type + "queueHooks");
        if (tmp && tmp.empty) {
          count++;
          tmp.empty.add(resolve);
        }
      }
      resolve();
      return defer.promise(obj);
    }
  });
  var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;
  var cssExpand = ["Top", "Right", "Bottom", "Left"];
  var isHidden = function(elem, el) {
    elem = el || elem;
    return jQuery.css(elem, "display") === "none" || !jQuery.contains(elem.ownerDocument, elem);
  };
  var rcheckableType = (/^(?:checkbox|radio)$/i);
  (function() {
    var fragment = document.createDocumentFragment(),
        div = fragment.appendChild(document.createElement("div")),
        input = document.createElement("input");
    input.setAttribute("type", "radio");
    input.setAttribute("checked", "checked");
    input.setAttribute("name", "t");
    div.appendChild(input);
    support.checkClone = div.cloneNode(true).cloneNode(true).lastChild.checked;
    div.innerHTML = "<textarea>x</textarea>";
    support.noCloneChecked = !!div.cloneNode(true).lastChild.defaultValue;
  })();
  var strundefined = typeof undefined;
  support.focusinBubbles = "onfocusin" in window;
  var rkeyEvent = /^key/,
      rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
      rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
      rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;
  function returnTrue() {
    return true;
  }
  function returnFalse() {
    return false;
  }
  function safeActiveElement() {
    try {
      return document.activeElement;
    } catch (err) {}
  }
  jQuery.event = {
    global: {},
    add: function(elem, types, handler, data, selector) {
      var handleObjIn,
          eventHandle,
          tmp,
          events,
          t,
          handleObj,
          special,
          handlers,
          type,
          namespaces,
          origType,
          elemData = data_priv.get(elem);
      if (!elemData) {
        return;
      }
      if (handler.handler) {
        handleObjIn = handler;
        handler = handleObjIn.handler;
        selector = handleObjIn.selector;
      }
      if (!handler.guid) {
        handler.guid = jQuery.guid++;
      }
      if (!(events = elemData.events)) {
        events = elemData.events = {};
      }
      if (!(eventHandle = elemData.handle)) {
        eventHandle = elemData.handle = function(e) {
          return typeof jQuery !== strundefined && jQuery.event.triggered !== e.type ? jQuery.event.dispatch.apply(elem, arguments) : undefined;
        };
      }
      types = (types || "").match(rnotwhite) || [""];
      t = types.length;
      while (t--) {
        tmp = rtypenamespace.exec(types[t]) || [];
        type = origType = tmp[1];
        namespaces = (tmp[2] || "").split(".").sort();
        if (!type) {
          continue;
        }
        special = jQuery.event.special[type] || {};
        type = (selector ? special.delegateType : special.bindType) || type;
        special = jQuery.event.special[type] || {};
        handleObj = jQuery.extend({
          type: type,
          origType: origType,
          data: data,
          handler: handler,
          guid: handler.guid,
          selector: selector,
          needsContext: selector && jQuery.expr.match.needsContext.test(selector),
          namespace: namespaces.join(".")
        }, handleObjIn);
        if (!(handlers = events[type])) {
          handlers = events[type] = [];
          handlers.delegateCount = 0;
          if (!special.setup || special.setup.call(elem, data, namespaces, eventHandle) === false) {
            if (elem.addEventListener) {
              elem.addEventListener(type, eventHandle, false);
            }
          }
        }
        if (special.add) {
          special.add.call(elem, handleObj);
          if (!handleObj.handler.guid) {
            handleObj.handler.guid = handler.guid;
          }
        }
        if (selector) {
          handlers.splice(handlers.delegateCount++, 0, handleObj);
        } else {
          handlers.push(handleObj);
        }
        jQuery.event.global[type] = true;
      }
    },
    remove: function(elem, types, handler, selector, mappedTypes) {
      var j,
          origCount,
          tmp,
          events,
          t,
          handleObj,
          special,
          handlers,
          type,
          namespaces,
          origType,
          elemData = data_priv.hasData(elem) && data_priv.get(elem);
      if (!elemData || !(events = elemData.events)) {
        return;
      }
      types = (types || "").match(rnotwhite) || [""];
      t = types.length;
      while (t--) {
        tmp = rtypenamespace.exec(types[t]) || [];
        type = origType = tmp[1];
        namespaces = (tmp[2] || "").split(".").sort();
        if (!type) {
          for (type in events) {
            jQuery.event.remove(elem, type + types[t], handler, selector, true);
          }
          continue;
        }
        special = jQuery.event.special[type] || {};
        type = (selector ? special.delegateType : special.bindType) || type;
        handlers = events[type] || [];
        tmp = tmp[2] && new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)");
        origCount = j = handlers.length;
        while (j--) {
          handleObj = handlers[j];
          if ((mappedTypes || origType === handleObj.origType) && (!handler || handler.guid === handleObj.guid) && (!tmp || tmp.test(handleObj.namespace)) && (!selector || selector === handleObj.selector || selector === "**" && handleObj.selector)) {
            handlers.splice(j, 1);
            if (handleObj.selector) {
              handlers.delegateCount--;
            }
            if (special.remove) {
              special.remove.call(elem, handleObj);
            }
          }
        }
        if (origCount && !handlers.length) {
          if (!special.teardown || special.teardown.call(elem, namespaces, elemData.handle) === false) {
            jQuery.removeEvent(elem, type, elemData.handle);
          }
          delete events[type];
        }
      }
      if (jQuery.isEmptyObject(events)) {
        delete elemData.handle;
        data_priv.remove(elem, "events");
      }
    },
    trigger: function(event, data, elem, onlyHandlers) {
      var i,
          cur,
          tmp,
          bubbleType,
          ontype,
          handle,
          special,
          eventPath = [elem || document],
          type = hasOwn.call(event, "type") ? event.type : event,
          namespaces = hasOwn.call(event, "namespace") ? event.namespace.split(".") : [];
      cur = tmp = elem = elem || document;
      if (elem.nodeType === 3 || elem.nodeType === 8) {
        return;
      }
      if (rfocusMorph.test(type + jQuery.event.triggered)) {
        return;
      }
      if (type.indexOf(".") >= 0) {
        namespaces = type.split(".");
        type = namespaces.shift();
        namespaces.sort();
      }
      ontype = type.indexOf(":") < 0 && "on" + type;
      event = event[jQuery.expando] ? event : new jQuery.Event(type, typeof event === "object" && event);
      event.isTrigger = onlyHandlers ? 2 : 3;
      event.namespace = namespaces.join(".");
      event.namespace_re = event.namespace ? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)") : null;
      event.result = undefined;
      if (!event.target) {
        event.target = elem;
      }
      data = data == null ? [event] : jQuery.makeArray(data, [event]);
      special = jQuery.event.special[type] || {};
      if (!onlyHandlers && special.trigger && special.trigger.apply(elem, data) === false) {
        return;
      }
      if (!onlyHandlers && !special.noBubble && !jQuery.isWindow(elem)) {
        bubbleType = special.delegateType || type;
        if (!rfocusMorph.test(bubbleType + type)) {
          cur = cur.parentNode;
        }
        for (; cur; cur = cur.parentNode) {
          eventPath.push(cur);
          tmp = cur;
        }
        if (tmp === (elem.ownerDocument || document)) {
          eventPath.push(tmp.defaultView || tmp.parentWindow || window);
        }
      }
      i = 0;
      while ((cur = eventPath[i++]) && !event.isPropagationStopped()) {
        event.type = i > 1 ? bubbleType : special.bindType || type;
        handle = (data_priv.get(cur, "events") || {})[event.type] && data_priv.get(cur, "handle");
        if (handle) {
          handle.apply(cur, data);
        }
        handle = ontype && cur[ontype];
        if (handle && handle.apply && jQuery.acceptData(cur)) {
          event.result = handle.apply(cur, data);
          if (event.result === false) {
            event.preventDefault();
          }
        }
      }
      event.type = type;
      if (!onlyHandlers && !event.isDefaultPrevented()) {
        if ((!special._default || special._default.apply(eventPath.pop(), data) === false) && jQuery.acceptData(elem)) {
          if (ontype && jQuery.isFunction(elem[type]) && !jQuery.isWindow(elem)) {
            tmp = elem[ontype];
            if (tmp) {
              elem[ontype] = null;
            }
            jQuery.event.triggered = type;
            elem[type]();
            jQuery.event.triggered = undefined;
            if (tmp) {
              elem[ontype] = tmp;
            }
          }
        }
      }
      return event.result;
    },
    dispatch: function(event) {
      event = jQuery.event.fix(event);
      var i,
          j,
          ret,
          matched,
          handleObj,
          handlerQueue = [],
          args = slice.call(arguments),
          handlers = (data_priv.get(this, "events") || {})[event.type] || [],
          special = jQuery.event.special[event.type] || {};
      args[0] = event;
      event.delegateTarget = this;
      if (special.preDispatch && special.preDispatch.call(this, event) === false) {
        return;
      }
      handlerQueue = jQuery.event.handlers.call(this, event, handlers);
      i = 0;
      while ((matched = handlerQueue[i++]) && !event.isPropagationStopped()) {
        event.currentTarget = matched.elem;
        j = 0;
        while ((handleObj = matched.handlers[j++]) && !event.isImmediatePropagationStopped()) {
          if (!event.namespace_re || event.namespace_re.test(handleObj.namespace)) {
            event.handleObj = handleObj;
            event.data = handleObj.data;
            ret = ((jQuery.event.special[handleObj.origType] || {}).handle || handleObj.handler).apply(matched.elem, args);
            if (ret !== undefined) {
              if ((event.result = ret) === false) {
                event.preventDefault();
                event.stopPropagation();
              }
            }
          }
        }
      }
      if (special.postDispatch) {
        special.postDispatch.call(this, event);
      }
      return event.result;
    },
    handlers: function(event, handlers) {
      var i,
          matches,
          sel,
          handleObj,
          handlerQueue = [],
          delegateCount = handlers.delegateCount,
          cur = event.target;
      if (delegateCount && cur.nodeType && (!event.button || event.type !== "click")) {
        for (; cur !== this; cur = cur.parentNode || this) {
          if (cur.disabled !== true || event.type !== "click") {
            matches = [];
            for (i = 0; i < delegateCount; i++) {
              handleObj = handlers[i];
              sel = handleObj.selector + " ";
              if (matches[sel] === undefined) {
                matches[sel] = handleObj.needsContext ? jQuery(sel, this).index(cur) >= 0 : jQuery.find(sel, this, null, [cur]).length;
              }
              if (matches[sel]) {
                matches.push(handleObj);
              }
            }
            if (matches.length) {
              handlerQueue.push({
                elem: cur,
                handlers: matches
              });
            }
          }
        }
      }
      if (delegateCount < handlers.length) {
        handlerQueue.push({
          elem: this,
          handlers: handlers.slice(delegateCount)
        });
      }
      return handlerQueue;
    },
    props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),
    fixHooks: {},
    keyHooks: {
      props: "char charCode key keyCode".split(" "),
      filter: function(event, original) {
        if (event.which == null) {
          event.which = original.charCode != null ? original.charCode : original.keyCode;
        }
        return event;
      }
    },
    mouseHooks: {
      props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
      filter: function(event, original) {
        var eventDoc,
            doc,
            body,
            button = original.button;
        if (event.pageX == null && original.clientX != null) {
          eventDoc = event.target.ownerDocument || document;
          doc = eventDoc.documentElement;
          body = eventDoc.body;
          event.pageX = original.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc && doc.clientLeft || body && body.clientLeft || 0);
          event.pageY = original.clientY + (doc && doc.scrollTop || body && body.scrollTop || 0) - (doc && doc.clientTop || body && body.clientTop || 0);
        }
        if (!event.which && button !== undefined) {
          event.which = (button & 1 ? 1 : (button & 2 ? 3 : (button & 4 ? 2 : 0)));
        }
        return event;
      }
    },
    fix: function(event) {
      if (event[jQuery.expando]) {
        return event;
      }
      var i,
          prop,
          copy,
          type = event.type,
          originalEvent = event,
          fixHook = this.fixHooks[type];
      if (!fixHook) {
        this.fixHooks[type] = fixHook = rmouseEvent.test(type) ? this.mouseHooks : rkeyEvent.test(type) ? this.keyHooks : {};
      }
      copy = fixHook.props ? this.props.concat(fixHook.props) : this.props;
      event = new jQuery.Event(originalEvent);
      i = copy.length;
      while (i--) {
        prop = copy[i];
        event[prop] = originalEvent[prop];
      }
      if (!event.target) {
        event.target = document;
      }
      if (event.target.nodeType === 3) {
        event.target = event.target.parentNode;
      }
      return fixHook.filter ? fixHook.filter(event, originalEvent) : event;
    },
    special: {
      load: {noBubble: true},
      focus: {
        trigger: function() {
          if (this !== safeActiveElement() && this.focus) {
            this.focus();
            return false;
          }
        },
        delegateType: "focusin"
      },
      blur: {
        trigger: function() {
          if (this === safeActiveElement() && this.blur) {
            this.blur();
            return false;
          }
        },
        delegateType: "focusout"
      },
      click: {
        trigger: function() {
          if (this.type === "checkbox" && this.click && jQuery.nodeName(this, "input")) {
            this.click();
            return false;
          }
        },
        _default: function(event) {
          return jQuery.nodeName(event.target, "a");
        }
      },
      beforeunload: {postDispatch: function(event) {
          if (event.result !== undefined && event.originalEvent) {
            event.originalEvent.returnValue = event.result;
          }
        }}
    },
    simulate: function(type, elem, event, bubble) {
      var e = jQuery.extend(new jQuery.Event(), event, {
        type: type,
        isSimulated: true,
        originalEvent: {}
      });
      if (bubble) {
        jQuery.event.trigger(e, null, elem);
      } else {
        jQuery.event.dispatch.call(elem, e);
      }
      if (e.isDefaultPrevented()) {
        event.preventDefault();
      }
    }
  };
  jQuery.removeEvent = function(elem, type, handle) {
    if (elem.removeEventListener) {
      elem.removeEventListener(type, handle, false);
    }
  };
  jQuery.Event = function(src, props) {
    if (!(this instanceof jQuery.Event)) {
      return new jQuery.Event(src, props);
    }
    if (src && src.type) {
      this.originalEvent = src;
      this.type = src.type;
      this.isDefaultPrevented = src.defaultPrevented || src.defaultPrevented === undefined && src.returnValue === false ? returnTrue : returnFalse;
    } else {
      this.type = src;
    }
    if (props) {
      jQuery.extend(this, props);
    }
    this.timeStamp = src && src.timeStamp || jQuery.now();
    this[jQuery.expando] = true;
  };
  jQuery.Event.prototype = {
    isDefaultPrevented: returnFalse,
    isPropagationStopped: returnFalse,
    isImmediatePropagationStopped: returnFalse,
    preventDefault: function() {
      var e = this.originalEvent;
      this.isDefaultPrevented = returnTrue;
      if (e && e.preventDefault) {
        e.preventDefault();
      }
    },
    stopPropagation: function() {
      var e = this.originalEvent;
      this.isPropagationStopped = returnTrue;
      if (e && e.stopPropagation) {
        e.stopPropagation();
      }
    },
    stopImmediatePropagation: function() {
      var e = this.originalEvent;
      this.isImmediatePropagationStopped = returnTrue;
      if (e && e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
      }
      this.stopPropagation();
    }
  };
  jQuery.each({
    mouseenter: "mouseover",
    mouseleave: "mouseout",
    pointerenter: "pointerover",
    pointerleave: "pointerout"
  }, function(orig, fix) {
    jQuery.event.special[orig] = {
      delegateType: fix,
      bindType: fix,
      handle: function(event) {
        var ret,
            target = this,
            related = event.relatedTarget,
            handleObj = event.handleObj;
        if (!related || (related !== target && !jQuery.contains(target, related))) {
          event.type = handleObj.origType;
          ret = handleObj.handler.apply(this, arguments);
          event.type = fix;
        }
        return ret;
      }
    };
  });
  if (!support.focusinBubbles) {
    jQuery.each({
      focus: "focusin",
      blur: "focusout"
    }, function(orig, fix) {
      var handler = function(event) {
        jQuery.event.simulate(fix, event.target, jQuery.event.fix(event), true);
      };
      jQuery.event.special[fix] = {
        setup: function() {
          var doc = this.ownerDocument || this,
              attaches = data_priv.access(doc, fix);
          if (!attaches) {
            doc.addEventListener(orig, handler, true);
          }
          data_priv.access(doc, fix, (attaches || 0) + 1);
        },
        teardown: function() {
          var doc = this.ownerDocument || this,
              attaches = data_priv.access(doc, fix) - 1;
          if (!attaches) {
            doc.removeEventListener(orig, handler, true);
            data_priv.remove(doc, fix);
          } else {
            data_priv.access(doc, fix, attaches);
          }
        }
      };
    });
  }
  jQuery.fn.extend({
    on: function(types, selector, data, fn, one) {
      var origFn,
          type;
      if (typeof types === "object") {
        if (typeof selector !== "string") {
          data = data || selector;
          selector = undefined;
        }
        for (type in types) {
          this.on(type, selector, data, types[type], one);
        }
        return this;
      }
      if (data == null && fn == null) {
        fn = selector;
        data = selector = undefined;
      } else if (fn == null) {
        if (typeof selector === "string") {
          fn = data;
          data = undefined;
        } else {
          fn = data;
          data = selector;
          selector = undefined;
        }
      }
      if (fn === false) {
        fn = returnFalse;
      } else if (!fn) {
        return this;
      }
      if (one === 1) {
        origFn = fn;
        fn = function(event) {
          jQuery().off(event);
          return origFn.apply(this, arguments);
        };
        fn.guid = origFn.guid || (origFn.guid = jQuery.guid++);
      }
      return this.each(function() {
        jQuery.event.add(this, types, fn, data, selector);
      });
    },
    one: function(types, selector, data, fn) {
      return this.on(types, selector, data, fn, 1);
    },
    off: function(types, selector, fn) {
      var handleObj,
          type;
      if (types && types.preventDefault && types.handleObj) {
        handleObj = types.handleObj;
        jQuery(types.delegateTarget).off(handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType, handleObj.selector, handleObj.handler);
        return this;
      }
      if (typeof types === "object") {
        for (type in types) {
          this.off(type, selector, types[type]);
        }
        return this;
      }
      if (selector === false || typeof selector === "function") {
        fn = selector;
        selector = undefined;
      }
      if (fn === false) {
        fn = returnFalse;
      }
      return this.each(function() {
        jQuery.event.remove(this, types, fn, selector);
      });
    },
    trigger: function(type, data) {
      return this.each(function() {
        jQuery.event.trigger(type, data, this);
      });
    },
    triggerHandler: function(type, data) {
      var elem = this[0];
      if (elem) {
        return jQuery.event.trigger(type, data, elem, true);
      }
    }
  });
  var rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
      rtagName = /<([\w:]+)/,
      rhtml = /<|&#?\w+;/,
      rnoInnerhtml = /<(?:script|style|link)/i,
      rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
      rscriptType = /^$|\/(?:java|ecma)script/i,
      rscriptTypeMasked = /^true\/(.*)/,
      rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,
      wrapMap = {
        option: [1, "<select multiple='multiple'>", "</select>"],
        thead: [1, "<table>", "</table>"],
        col: [2, "<table><colgroup>", "</colgroup></table>"],
        tr: [2, "<table><tbody>", "</tbody></table>"],
        td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
        _default: [0, "", ""]
      };
  wrapMap.optgroup = wrapMap.option;
  wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
  wrapMap.th = wrapMap.td;
  function manipulationTarget(elem, content) {
    return jQuery.nodeName(elem, "table") && jQuery.nodeName(content.nodeType !== 11 ? content : content.firstChild, "tr") ? elem.getElementsByTagName("tbody")[0] || elem.appendChild(elem.ownerDocument.createElement("tbody")) : elem;
  }
  function disableScript(elem) {
    elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
    return elem;
  }
  function restoreScript(elem) {
    var match = rscriptTypeMasked.exec(elem.type);
    if (match) {
      elem.type = match[1];
    } else {
      elem.removeAttribute("type");
    }
    return elem;
  }
  function setGlobalEval(elems, refElements) {
    var i = 0,
        l = elems.length;
    for (; i < l; i++) {
      data_priv.set(elems[i], "globalEval", !refElements || data_priv.get(refElements[i], "globalEval"));
    }
  }
  function cloneCopyEvent(src, dest) {
    var i,
        l,
        type,
        pdataOld,
        pdataCur,
        udataOld,
        udataCur,
        events;
    if (dest.nodeType !== 1) {
      return;
    }
    if (data_priv.hasData(src)) {
      pdataOld = data_priv.access(src);
      pdataCur = data_priv.set(dest, pdataOld);
      events = pdataOld.events;
      if (events) {
        delete pdataCur.handle;
        pdataCur.events = {};
        for (type in events) {
          for (i = 0, l = events[type].length; i < l; i++) {
            jQuery.event.add(dest, type, events[type][i]);
          }
        }
      }
    }
    if (data_user.hasData(src)) {
      udataOld = data_user.access(src);
      udataCur = jQuery.extend({}, udataOld);
      data_user.set(dest, udataCur);
    }
  }
  function getAll(context, tag) {
    var ret = context.getElementsByTagName ? context.getElementsByTagName(tag || "*") : context.querySelectorAll ? context.querySelectorAll(tag || "*") : [];
    return tag === undefined || tag && jQuery.nodeName(context, tag) ? jQuery.merge([context], ret) : ret;
  }
  function fixInput(src, dest) {
    var nodeName = dest.nodeName.toLowerCase();
    if (nodeName === "input" && rcheckableType.test(src.type)) {
      dest.checked = src.checked;
    } else if (nodeName === "input" || nodeName === "textarea") {
      dest.defaultValue = src.defaultValue;
    }
  }
  jQuery.extend({
    clone: function(elem, dataAndEvents, deepDataAndEvents) {
      var i,
          l,
          srcElements,
          destElements,
          clone = elem.cloneNode(true),
          inPage = jQuery.contains(elem.ownerDocument, elem);
      if (!support.noCloneChecked && (elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem)) {
        destElements = getAll(clone);
        srcElements = getAll(elem);
        for (i = 0, l = srcElements.length; i < l; i++) {
          fixInput(srcElements[i], destElements[i]);
        }
      }
      if (dataAndEvents) {
        if (deepDataAndEvents) {
          srcElements = srcElements || getAll(elem);
          destElements = destElements || getAll(clone);
          for (i = 0, l = srcElements.length; i < l; i++) {
            cloneCopyEvent(srcElements[i], destElements[i]);
          }
        } else {
          cloneCopyEvent(elem, clone);
        }
      }
      destElements = getAll(clone, "script");
      if (destElements.length > 0) {
        setGlobalEval(destElements, !inPage && getAll(elem, "script"));
      }
      return clone;
    },
    buildFragment: function(elems, context, scripts, selection) {
      var elem,
          tmp,
          tag,
          wrap,
          contains,
          j,
          fragment = context.createDocumentFragment(),
          nodes = [],
          i = 0,
          l = elems.length;
      for (; i < l; i++) {
        elem = elems[i];
        if (elem || elem === 0) {
          if (jQuery.type(elem) === "object") {
            jQuery.merge(nodes, elem.nodeType ? [elem] : elem);
          } else if (!rhtml.test(elem)) {
            nodes.push(context.createTextNode(elem));
          } else {
            tmp = tmp || fragment.appendChild(context.createElement("div"));
            tag = (rtagName.exec(elem) || ["", ""])[1].toLowerCase();
            wrap = wrapMap[tag] || wrapMap._default;
            tmp.innerHTML = wrap[1] + elem.replace(rxhtmlTag, "<$1></$2>") + wrap[2];
            j = wrap[0];
            while (j--) {
              tmp = tmp.lastChild;
            }
            jQuery.merge(nodes, tmp.childNodes);
            tmp = fragment.firstChild;
            tmp.textContent = "";
          }
        }
      }
      fragment.textContent = "";
      i = 0;
      while ((elem = nodes[i++])) {
        if (selection && jQuery.inArray(elem, selection) !== -1) {
          continue;
        }
        contains = jQuery.contains(elem.ownerDocument, elem);
        tmp = getAll(fragment.appendChild(elem), "script");
        if (contains) {
          setGlobalEval(tmp);
        }
        if (scripts) {
          j = 0;
          while ((elem = tmp[j++])) {
            if (rscriptType.test(elem.type || "")) {
              scripts.push(elem);
            }
          }
        }
      }
      return fragment;
    },
    cleanData: function(elems) {
      var data,
          elem,
          type,
          key,
          special = jQuery.event.special,
          i = 0;
      for (; (elem = elems[i]) !== undefined; i++) {
        if (jQuery.acceptData(elem)) {
          key = elem[data_priv.expando];
          if (key && (data = data_priv.cache[key])) {
            if (data.events) {
              for (type in data.events) {
                if (special[type]) {
                  jQuery.event.remove(elem, type);
                } else {
                  jQuery.removeEvent(elem, type, data.handle);
                }
              }
            }
            if (data_priv.cache[key]) {
              delete data_priv.cache[key];
            }
          }
        }
        delete data_user.cache[elem[data_user.expando]];
      }
    }
  });
  jQuery.fn.extend({
    text: function(value) {
      return access(this, function(value) {
        return value === undefined ? jQuery.text(this) : this.empty().each(function() {
          if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
            this.textContent = value;
          }
        });
      }, null, value, arguments.length);
    },
    append: function() {
      return this.domManip(arguments, function(elem) {
        if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
          var target = manipulationTarget(this, elem);
          target.appendChild(elem);
        }
      });
    },
    prepend: function() {
      return this.domManip(arguments, function(elem) {
        if (this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9) {
          var target = manipulationTarget(this, elem);
          target.insertBefore(elem, target.firstChild);
        }
      });
    },
    before: function() {
      return this.domManip(arguments, function(elem) {
        if (this.parentNode) {
          this.parentNode.insertBefore(elem, this);
        }
      });
    },
    after: function() {
      return this.domManip(arguments, function(elem) {
        if (this.parentNode) {
          this.parentNode.insertBefore(elem, this.nextSibling);
        }
      });
    },
    remove: function(selector, keepData) {
      var elem,
          elems = selector ? jQuery.filter(selector, this) : this,
          i = 0;
      for (; (elem = elems[i]) != null; i++) {
        if (!keepData && elem.nodeType === 1) {
          jQuery.cleanData(getAll(elem));
        }
        if (elem.parentNode) {
          if (keepData && jQuery.contains(elem.ownerDocument, elem)) {
            setGlobalEval(getAll(elem, "script"));
          }
          elem.parentNode.removeChild(elem);
        }
      }
      return this;
    },
    empty: function() {
      var elem,
          i = 0;
      for (; (elem = this[i]) != null; i++) {
        if (elem.nodeType === 1) {
          jQuery.cleanData(getAll(elem, false));
          elem.textContent = "";
        }
      }
      return this;
    },
    clone: function(dataAndEvents, deepDataAndEvents) {
      dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
      deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;
      return this.map(function() {
        return jQuery.clone(this, dataAndEvents, deepDataAndEvents);
      });
    },
    html: function(value) {
      return access(this, function(value) {
        var elem = this[0] || {},
            i = 0,
            l = this.length;
        if (value === undefined && elem.nodeType === 1) {
          return elem.innerHTML;
        }
        if (typeof value === "string" && !rnoInnerhtml.test(value) && !wrapMap[(rtagName.exec(value) || ["", ""])[1].toLowerCase()]) {
          value = value.replace(rxhtmlTag, "<$1></$2>");
          try {
            for (; i < l; i++) {
              elem = this[i] || {};
              if (elem.nodeType === 1) {
                jQuery.cleanData(getAll(elem, false));
                elem.innerHTML = value;
              }
            }
            elem = 0;
          } catch (e) {}
        }
        if (elem) {
          this.empty().append(value);
        }
      }, null, value, arguments.length);
    },
    replaceWith: function() {
      var arg = arguments[0];
      this.domManip(arguments, function(elem) {
        arg = this.parentNode;
        jQuery.cleanData(getAll(this));
        if (arg) {
          arg.replaceChild(elem, this);
        }
      });
      return arg && (arg.length || arg.nodeType) ? this : this.remove();
    },
    detach: function(selector) {
      return this.remove(selector, true);
    },
    domManip: function(args, callback) {
      args = concat.apply([], args);
      var fragment,
          first,
          scripts,
          hasScripts,
          node,
          doc,
          i = 0,
          l = this.length,
          set = this,
          iNoClone = l - 1,
          value = args[0],
          isFunction = jQuery.isFunction(value);
      if (isFunction || (l > 1 && typeof value === "string" && !support.checkClone && rchecked.test(value))) {
        return this.each(function(index) {
          var self = set.eq(index);
          if (isFunction) {
            args[0] = value.call(this, index, self.html());
          }
          self.domManip(args, callback);
        });
      }
      if (l) {
        fragment = jQuery.buildFragment(args, this[0].ownerDocument, false, this);
        first = fragment.firstChild;
        if (fragment.childNodes.length === 1) {
          fragment = first;
        }
        if (first) {
          scripts = jQuery.map(getAll(fragment, "script"), disableScript);
          hasScripts = scripts.length;
          for (; i < l; i++) {
            node = fragment;
            if (i !== iNoClone) {
              node = jQuery.clone(node, true, true);
              if (hasScripts) {
                jQuery.merge(scripts, getAll(node, "script"));
              }
            }
            callback.call(this[i], node, i);
          }
          if (hasScripts) {
            doc = scripts[scripts.length - 1].ownerDocument;
            jQuery.map(scripts, restoreScript);
            for (i = 0; i < hasScripts; i++) {
              node = scripts[i];
              if (rscriptType.test(node.type || "") && !data_priv.access(node, "globalEval") && jQuery.contains(doc, node)) {
                if (node.src) {
                  if (jQuery._evalUrl) {
                    jQuery._evalUrl(node.src);
                  }
                } else {
                  jQuery.globalEval(node.textContent.replace(rcleanScript, ""));
                }
              }
            }
          }
        }
      }
      return this;
    }
  });
  jQuery.each({
    appendTo: "append",
    prependTo: "prepend",
    insertBefore: "before",
    insertAfter: "after",
    replaceAll: "replaceWith"
  }, function(name, original) {
    jQuery.fn[name] = function(selector) {
      var elems,
          ret = [],
          insert = jQuery(selector),
          last = insert.length - 1,
          i = 0;
      for (; i <= last; i++) {
        elems = i === last ? this : this.clone(true);
        jQuery(insert[i])[original](elems);
        push.apply(ret, elems.get());
      }
      return this.pushStack(ret);
    };
  });
  var iframe,
      elemdisplay = {};
  function actualDisplay(name, doc) {
    var style,
        elem = jQuery(doc.createElement(name)).appendTo(doc.body),
        display = window.getDefaultComputedStyle && (style = window.getDefaultComputedStyle(elem[0])) ? style.display : jQuery.css(elem[0], "display");
    elem.detach();
    return display;
  }
  function defaultDisplay(nodeName) {
    var doc = document,
        display = elemdisplay[nodeName];
    if (!display) {
      display = actualDisplay(nodeName, doc);
      if (display === "none" || !display) {
        iframe = (iframe || jQuery("<iframe frameborder='0' width='0' height='0'/>")).appendTo(doc.documentElement);
        doc = iframe[0].contentDocument;
        doc.write();
        doc.close();
        display = actualDisplay(nodeName, doc);
        iframe.detach();
      }
      elemdisplay[nodeName] = display;
    }
    return display;
  }
  var rmargin = (/^margin/);
  var rnumnonpx = new RegExp("^(" + pnum + ")(?!px)[a-z%]+$", "i");
  var getStyles = function(elem) {
    if (elem.ownerDocument.defaultView.opener) {
      return elem.ownerDocument.defaultView.getComputedStyle(elem, null);
    }
    return window.getComputedStyle(elem, null);
  };
  function curCSS(elem, name, computed) {
    var width,
        minWidth,
        maxWidth,
        ret,
        style = elem.style;
    computed = computed || getStyles(elem);
    if (computed) {
      ret = computed.getPropertyValue(name) || computed[name];
    }
    if (computed) {
      if (ret === "" && !jQuery.contains(elem.ownerDocument, elem)) {
        ret = jQuery.style(elem, name);
      }
      if (rnumnonpx.test(ret) && rmargin.test(name)) {
        width = style.width;
        minWidth = style.minWidth;
        maxWidth = style.maxWidth;
        style.minWidth = style.maxWidth = style.width = ret;
        ret = computed.width;
        style.width = width;
        style.minWidth = minWidth;
        style.maxWidth = maxWidth;
      }
    }
    return ret !== undefined ? ret + "" : ret;
  }
  function addGetHookIf(conditionFn, hookFn) {
    return {get: function() {
        if (conditionFn()) {
          delete this.get;
          return;
        }
        return (this.get = hookFn).apply(this, arguments);
      }};
  }
  (function() {
    var pixelPositionVal,
        boxSizingReliableVal,
        docElem = document.documentElement,
        container = document.createElement("div"),
        div = document.createElement("div");
    if (!div.style) {
      return;
    }
    div.style.backgroundClip = "content-box";
    div.cloneNode(true).style.backgroundClip = "";
    support.clearCloneStyle = div.style.backgroundClip === "content-box";
    container.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;" + "position:absolute";
    container.appendChild(div);
    function computePixelPositionAndBoxSizingReliable() {
      div.style.cssText = "-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" + "box-sizing:border-box;display:block;margin-top:1%;top:1%;" + "border:1px;padding:1px;width:4px;position:absolute";
      div.innerHTML = "";
      docElem.appendChild(container);
      var divStyle = window.getComputedStyle(div, null);
      pixelPositionVal = divStyle.top !== "1%";
      boxSizingReliableVal = divStyle.width === "4px";
      docElem.removeChild(container);
    }
    if (window.getComputedStyle) {
      jQuery.extend(support, {
        pixelPosition: function() {
          computePixelPositionAndBoxSizingReliable();
          return pixelPositionVal;
        },
        boxSizingReliable: function() {
          if (boxSizingReliableVal == null) {
            computePixelPositionAndBoxSizingReliable();
          }
          return boxSizingReliableVal;
        },
        reliableMarginRight: function() {
          var ret,
              marginDiv = div.appendChild(document.createElement("div"));
          marginDiv.style.cssText = div.style.cssText = "-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" + "box-sizing:content-box;display:block;margin:0;border:0;padding:0";
          marginDiv.style.marginRight = marginDiv.style.width = "0";
          div.style.width = "1px";
          docElem.appendChild(container);
          ret = !parseFloat(window.getComputedStyle(marginDiv, null).marginRight);
          docElem.removeChild(container);
          div.removeChild(marginDiv);
          return ret;
        }
      });
    }
  })();
  jQuery.swap = function(elem, options, callback, args) {
    var ret,
        name,
        old = {};
    for (name in options) {
      old[name] = elem.style[name];
      elem.style[name] = options[name];
    }
    ret = callback.apply(elem, args || []);
    for (name in options) {
      elem.style[name] = old[name];
    }
    return ret;
  };
  var rdisplayswap = /^(none|table(?!-c[ea]).+)/,
      rnumsplit = new RegExp("^(" + pnum + ")(.*)$", "i"),
      rrelNum = new RegExp("^([+-])=(" + pnum + ")", "i"),
      cssShow = {
        position: "absolute",
        visibility: "hidden",
        display: "block"
      },
      cssNormalTransform = {
        letterSpacing: "0",
        fontWeight: "400"
      },
      cssPrefixes = ["Webkit", "O", "Moz", "ms"];
  function vendorPropName(style, name) {
    if (name in style) {
      return name;
    }
    var capName = name[0].toUpperCase() + name.slice(1),
        origName = name,
        i = cssPrefixes.length;
    while (i--) {
      name = cssPrefixes[i] + capName;
      if (name in style) {
        return name;
      }
    }
    return origName;
  }
  function setPositiveNumber(elem, value, subtract) {
    var matches = rnumsplit.exec(value);
    return matches ? Math.max(0, matches[1] - (subtract || 0)) + (matches[2] || "px") : value;
  }
  function augmentWidthOrHeight(elem, name, extra, isBorderBox, styles) {
    var i = extra === (isBorderBox ? "border" : "content") ? 4 : name === "width" ? 1 : 0,
        val = 0;
    for (; i < 4; i += 2) {
      if (extra === "margin") {
        val += jQuery.css(elem, extra + cssExpand[i], true, styles);
      }
      if (isBorderBox) {
        if (extra === "content") {
          val -= jQuery.css(elem, "padding" + cssExpand[i], true, styles);
        }
        if (extra !== "margin") {
          val -= jQuery.css(elem, "border" + cssExpand[i] + "Width", true, styles);
        }
      } else {
        val += jQuery.css(elem, "padding" + cssExpand[i], true, styles);
        if (extra !== "padding") {
          val += jQuery.css(elem, "border" + cssExpand[i] + "Width", true, styles);
        }
      }
    }
    return val;
  }
  function getWidthOrHeight(elem, name, extra) {
    var valueIsBorderBox = true,
        val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
        styles = getStyles(elem),
        isBorderBox = jQuery.css(elem, "boxSizing", false, styles) === "border-box";
    if (val <= 0 || val == null) {
      val = curCSS(elem, name, styles);
      if (val < 0 || val == null) {
        val = elem.style[name];
      }
      if (rnumnonpx.test(val)) {
        return val;
      }
      valueIsBorderBox = isBorderBox && (support.boxSizingReliable() || val === elem.style[name]);
      val = parseFloat(val) || 0;
    }
    return (val + augmentWidthOrHeight(elem, name, extra || (isBorderBox ? "border" : "content"), valueIsBorderBox, styles)) + "px";
  }
  function showHide(elements, show) {
    var display,
        elem,
        hidden,
        values = [],
        index = 0,
        length = elements.length;
    for (; index < length; index++) {
      elem = elements[index];
      if (!elem.style) {
        continue;
      }
      values[index] = data_priv.get(elem, "olddisplay");
      display = elem.style.display;
      if (show) {
        if (!values[index] && display === "none") {
          elem.style.display = "";
        }
        if (elem.style.display === "" && isHidden(elem)) {
          values[index] = data_priv.access(elem, "olddisplay", defaultDisplay(elem.nodeName));
        }
      } else {
        hidden = isHidden(elem);
        if (display !== "none" || !hidden) {
          data_priv.set(elem, "olddisplay", hidden ? display : jQuery.css(elem, "display"));
        }
      }
    }
    for (index = 0; index < length; index++) {
      elem = elements[index];
      if (!elem.style) {
        continue;
      }
      if (!show || elem.style.display === "none" || elem.style.display === "") {
        elem.style.display = show ? values[index] || "" : "none";
      }
    }
    return elements;
  }
  jQuery.extend({
    cssHooks: {opacity: {get: function(elem, computed) {
          if (computed) {
            var ret = curCSS(elem, "opacity");
            return ret === "" ? "1" : ret;
          }
        }}},
    cssNumber: {
      "columnCount": true,
      "fillOpacity": true,
      "flexGrow": true,
      "flexShrink": true,
      "fontWeight": true,
      "lineHeight": true,
      "opacity": true,
      "order": true,
      "orphans": true,
      "widows": true,
      "zIndex": true,
      "zoom": true
    },
    cssProps: {"float": "cssFloat"},
    style: function(elem, name, value, extra) {
      if (!elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style) {
        return;
      }
      var ret,
          type,
          hooks,
          origName = jQuery.camelCase(name),
          style = elem.style;
      name = jQuery.cssProps[origName] || (jQuery.cssProps[origName] = vendorPropName(style, origName));
      hooks = jQuery.cssHooks[name] || jQuery.cssHooks[origName];
      if (value !== undefined) {
        type = typeof value;
        if (type === "string" && (ret = rrelNum.exec(value))) {
          value = (ret[1] + 1) * ret[2] + parseFloat(jQuery.css(elem, name));
          type = "number";
        }
        if (value == null || value !== value) {
          return;
        }
        if (type === "number" && !jQuery.cssNumber[origName]) {
          value += "px";
        }
        if (!support.clearCloneStyle && value === "" && name.indexOf("background") === 0) {
          style[name] = "inherit";
        }
        if (!hooks || !("set" in hooks) || (value = hooks.set(elem, value, extra)) !== undefined) {
          style[name] = value;
        }
      } else {
        if (hooks && "get" in hooks && (ret = hooks.get(elem, false, extra)) !== undefined) {
          return ret;
        }
        return style[name];
      }
    },
    css: function(elem, name, extra, styles) {
      var val,
          num,
          hooks,
          origName = jQuery.camelCase(name);
      name = jQuery.cssProps[origName] || (jQuery.cssProps[origName] = vendorPropName(elem.style, origName));
      hooks = jQuery.cssHooks[name] || jQuery.cssHooks[origName];
      if (hooks && "get" in hooks) {
        val = hooks.get(elem, true, extra);
      }
      if (val === undefined) {
        val = curCSS(elem, name, styles);
      }
      if (val === "normal" && name in cssNormalTransform) {
        val = cssNormalTransform[name];
      }
      if (extra === "" || extra) {
        num = parseFloat(val);
        return extra === true || jQuery.isNumeric(num) ? num || 0 : val;
      }
      return val;
    }
  });
  jQuery.each(["height", "width"], function(i, name) {
    jQuery.cssHooks[name] = {
      get: function(elem, computed, extra) {
        if (computed) {
          return rdisplayswap.test(jQuery.css(elem, "display")) && elem.offsetWidth === 0 ? jQuery.swap(elem, cssShow, function() {
            return getWidthOrHeight(elem, name, extra);
          }) : getWidthOrHeight(elem, name, extra);
        }
      },
      set: function(elem, value, extra) {
        var styles = extra && getStyles(elem);
        return setPositiveNumber(elem, value, extra ? augmentWidthOrHeight(elem, name, extra, jQuery.css(elem, "boxSizing", false, styles) === "border-box", styles) : 0);
      }
    };
  });
  jQuery.cssHooks.marginRight = addGetHookIf(support.reliableMarginRight, function(elem, computed) {
    if (computed) {
      return jQuery.swap(elem, {"display": "inline-block"}, curCSS, [elem, "marginRight"]);
    }
  });
  jQuery.each({
    margin: "",
    padding: "",
    border: "Width"
  }, function(prefix, suffix) {
    jQuery.cssHooks[prefix + suffix] = {expand: function(value) {
        var i = 0,
            expanded = {},
            parts = typeof value === "string" ? value.split(" ") : [value];
        for (; i < 4; i++) {
          expanded[prefix + cssExpand[i] + suffix] = parts[i] || parts[i - 2] || parts[0];
        }
        return expanded;
      }};
    if (!rmargin.test(prefix)) {
      jQuery.cssHooks[prefix + suffix].set = setPositiveNumber;
    }
  });
  jQuery.fn.extend({
    css: function(name, value) {
      return access(this, function(elem, name, value) {
        var styles,
            len,
            map = {},
            i = 0;
        if (jQuery.isArray(name)) {
          styles = getStyles(elem);
          len = name.length;
          for (; i < len; i++) {
            map[name[i]] = jQuery.css(elem, name[i], false, styles);
          }
          return map;
        }
        return value !== undefined ? jQuery.style(elem, name, value) : jQuery.css(elem, name);
      }, name, value, arguments.length > 1);
    },
    show: function() {
      return showHide(this, true);
    },
    hide: function() {
      return showHide(this);
    },
    toggle: function(state) {
      if (typeof state === "boolean") {
        return state ? this.show() : this.hide();
      }
      return this.each(function() {
        if (isHidden(this)) {
          jQuery(this).show();
        } else {
          jQuery(this).hide();
        }
      });
    }
  });
  function Tween(elem, options, prop, end, easing) {
    return new Tween.prototype.init(elem, options, prop, end, easing);
  }
  jQuery.Tween = Tween;
  Tween.prototype = {
    constructor: Tween,
    init: function(elem, options, prop, end, easing, unit) {
      this.elem = elem;
      this.prop = prop;
      this.easing = easing || "swing";
      this.options = options;
      this.start = this.now = this.cur();
      this.end = end;
      this.unit = unit || (jQuery.cssNumber[prop] ? "" : "px");
    },
    cur: function() {
      var hooks = Tween.propHooks[this.prop];
      return hooks && hooks.get ? hooks.get(this) : Tween.propHooks._default.get(this);
    },
    run: function(percent) {
      var eased,
          hooks = Tween.propHooks[this.prop];
      if (this.options.duration) {
        this.pos = eased = jQuery.easing[this.easing](percent, this.options.duration * percent, 0, 1, this.options.duration);
      } else {
        this.pos = eased = percent;
      }
      this.now = (this.end - this.start) * eased + this.start;
      if (this.options.step) {
        this.options.step.call(this.elem, this.now, this);
      }
      if (hooks && hooks.set) {
        hooks.set(this);
      } else {
        Tween.propHooks._default.set(this);
      }
      return this;
    }
  };
  Tween.prototype.init.prototype = Tween.prototype;
  Tween.propHooks = {_default: {
      get: function(tween) {
        var result;
        if (tween.elem[tween.prop] != null && (!tween.elem.style || tween.elem.style[tween.prop] == null)) {
          return tween.elem[tween.prop];
        }
        result = jQuery.css(tween.elem, tween.prop, "");
        return !result || result === "auto" ? 0 : result;
      },
      set: function(tween) {
        if (jQuery.fx.step[tween.prop]) {
          jQuery.fx.step[tween.prop](tween);
        } else if (tween.elem.style && (tween.elem.style[jQuery.cssProps[tween.prop]] != null || jQuery.cssHooks[tween.prop])) {
          jQuery.style(tween.elem, tween.prop, tween.now + tween.unit);
        } else {
          tween.elem[tween.prop] = tween.now;
        }
      }
    }};
  Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {set: function(tween) {
      if (tween.elem.nodeType && tween.elem.parentNode) {
        tween.elem[tween.prop] = tween.now;
      }
    }};
  jQuery.easing = {
    linear: function(p) {
      return p;
    },
    swing: function(p) {
      return 0.5 - Math.cos(p * Math.PI) / 2;
    }
  };
  jQuery.fx = Tween.prototype.init;
  jQuery.fx.step = {};
  var fxNow,
      timerId,
      rfxtypes = /^(?:toggle|show|hide)$/,
      rfxnum = new RegExp("^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i"),
      rrun = /queueHooks$/,
      animationPrefilters = [defaultPrefilter],
      tweeners = {"*": [function(prop, value) {
          var tween = this.createTween(prop, value),
              target = tween.cur(),
              parts = rfxnum.exec(value),
              unit = parts && parts[3] || (jQuery.cssNumber[prop] ? "" : "px"),
              start = (jQuery.cssNumber[prop] || unit !== "px" && +target) && rfxnum.exec(jQuery.css(tween.elem, prop)),
              scale = 1,
              maxIterations = 20;
          if (start && start[3] !== unit) {
            unit = unit || start[3];
            parts = parts || [];
            start = +target || 1;
            do {
              scale = scale || ".5";
              start = start / scale;
              jQuery.style(tween.elem, prop, start + unit);
            } while (scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations);
          }
          if (parts) {
            start = tween.start = +start || +target || 0;
            tween.unit = unit;
            tween.end = parts[1] ? start + (parts[1] + 1) * parts[2] : +parts[2];
          }
          return tween;
        }]};
  function createFxNow() {
    setTimeout(function() {
      fxNow = undefined;
    });
    return (fxNow = jQuery.now());
  }
  function genFx(type, includeWidth) {
    var which,
        i = 0,
        attrs = {height: type};
    includeWidth = includeWidth ? 1 : 0;
    for (; i < 4; i += 2 - includeWidth) {
      which = cssExpand[i];
      attrs["margin" + which] = attrs["padding" + which] = type;
    }
    if (includeWidth) {
      attrs.opacity = attrs.width = type;
    }
    return attrs;
  }
  function createTween(value, prop, animation) {
    var tween,
        collection = (tweeners[prop] || []).concat(tweeners["*"]),
        index = 0,
        length = collection.length;
    for (; index < length; index++) {
      if ((tween = collection[index].call(animation, prop, value))) {
        return tween;
      }
    }
  }
  function defaultPrefilter(elem, props, opts) {
    var prop,
        value,
        toggle,
        tween,
        hooks,
        oldfire,
        display,
        checkDisplay,
        anim = this,
        orig = {},
        style = elem.style,
        hidden = elem.nodeType && isHidden(elem),
        dataShow = data_priv.get(elem, "fxshow");
    if (!opts.queue) {
      hooks = jQuery._queueHooks(elem, "fx");
      if (hooks.unqueued == null) {
        hooks.unqueued = 0;
        oldfire = hooks.empty.fire;
        hooks.empty.fire = function() {
          if (!hooks.unqueued) {
            oldfire();
          }
        };
      }
      hooks.unqueued++;
      anim.always(function() {
        anim.always(function() {
          hooks.unqueued--;
          if (!jQuery.queue(elem, "fx").length) {
            hooks.empty.fire();
          }
        });
      });
    }
    if (elem.nodeType === 1 && ("height" in props || "width" in props)) {
      opts.overflow = [style.overflow, style.overflowX, style.overflowY];
      display = jQuery.css(elem, "display");
      checkDisplay = display === "none" ? data_priv.get(elem, "olddisplay") || defaultDisplay(elem.nodeName) : display;
      if (checkDisplay === "inline" && jQuery.css(elem, "float") === "none") {
        style.display = "inline-block";
      }
    }
    if (opts.overflow) {
      style.overflow = "hidden";
      anim.always(function() {
        style.overflow = opts.overflow[0];
        style.overflowX = opts.overflow[1];
        style.overflowY = opts.overflow[2];
      });
    }
    for (prop in props) {
      value = props[prop];
      if (rfxtypes.exec(value)) {
        delete props[prop];
        toggle = toggle || value === "toggle";
        if (value === (hidden ? "hide" : "show")) {
          if (value === "show" && dataShow && dataShow[prop] !== undefined) {
            hidden = true;
          } else {
            continue;
          }
        }
        orig[prop] = dataShow && dataShow[prop] || jQuery.style(elem, prop);
      } else {
        display = undefined;
      }
    }
    if (!jQuery.isEmptyObject(orig)) {
      if (dataShow) {
        if ("hidden" in dataShow) {
          hidden = dataShow.hidden;
        }
      } else {
        dataShow = data_priv.access(elem, "fxshow", {});
      }
      if (toggle) {
        dataShow.hidden = !hidden;
      }
      if (hidden) {
        jQuery(elem).show();
      } else {
        anim.done(function() {
          jQuery(elem).hide();
        });
      }
      anim.done(function() {
        var prop;
        data_priv.remove(elem, "fxshow");
        for (prop in orig) {
          jQuery.style(elem, prop, orig[prop]);
        }
      });
      for (prop in orig) {
        tween = createTween(hidden ? dataShow[prop] : 0, prop, anim);
        if (!(prop in dataShow)) {
          dataShow[prop] = tween.start;
          if (hidden) {
            tween.end = tween.start;
            tween.start = prop === "width" || prop === "height" ? 1 : 0;
          }
        }
      }
    } else if ((display === "none" ? defaultDisplay(elem.nodeName) : display) === "inline") {
      style.display = display;
    }
  }
  function propFilter(props, specialEasing) {
    var index,
        name,
        easing,
        value,
        hooks;
    for (index in props) {
      name = jQuery.camelCase(index);
      easing = specialEasing[name];
      value = props[index];
      if (jQuery.isArray(value)) {
        easing = value[1];
        value = props[index] = value[0];
      }
      if (index !== name) {
        props[name] = value;
        delete props[index];
      }
      hooks = jQuery.cssHooks[name];
      if (hooks && "expand" in hooks) {
        value = hooks.expand(value);
        delete props[name];
        for (index in value) {
          if (!(index in props)) {
            props[index] = value[index];
            specialEasing[index] = easing;
          }
        }
      } else {
        specialEasing[name] = easing;
      }
    }
  }
  function Animation(elem, properties, options) {
    var result,
        stopped,
        index = 0,
        length = animationPrefilters.length,
        deferred = jQuery.Deferred().always(function() {
          delete tick.elem;
        }),
        tick = function() {
          if (stopped) {
            return false;
          }
          var currentTime = fxNow || createFxNow(),
              remaining = Math.max(0, animation.startTime + animation.duration - currentTime),
              temp = remaining / animation.duration || 0,
              percent = 1 - temp,
              index = 0,
              length = animation.tweens.length;
          for (; index < length; index++) {
            animation.tweens[index].run(percent);
          }
          deferred.notifyWith(elem, [animation, percent, remaining]);
          if (percent < 1 && length) {
            return remaining;
          } else {
            deferred.resolveWith(elem, [animation]);
            return false;
          }
        },
        animation = deferred.promise({
          elem: elem,
          props: jQuery.extend({}, properties),
          opts: jQuery.extend(true, {specialEasing: {}}, options),
          originalProperties: properties,
          originalOptions: options,
          startTime: fxNow || createFxNow(),
          duration: options.duration,
          tweens: [],
          createTween: function(prop, end) {
            var tween = jQuery.Tween(elem, animation.opts, prop, end, animation.opts.specialEasing[prop] || animation.opts.easing);
            animation.tweens.push(tween);
            return tween;
          },
          stop: function(gotoEnd) {
            var index = 0,
                length = gotoEnd ? animation.tweens.length : 0;
            if (stopped) {
              return this;
            }
            stopped = true;
            for (; index < length; index++) {
              animation.tweens[index].run(1);
            }
            if (gotoEnd) {
              deferred.resolveWith(elem, [animation, gotoEnd]);
            } else {
              deferred.rejectWith(elem, [animation, gotoEnd]);
            }
            return this;
          }
        }),
        props = animation.props;
    propFilter(props, animation.opts.specialEasing);
    for (; index < length; index++) {
      result = animationPrefilters[index].call(animation, elem, props, animation.opts);
      if (result) {
        return result;
      }
    }
    jQuery.map(props, createTween, animation);
    if (jQuery.isFunction(animation.opts.start)) {
      animation.opts.start.call(elem, animation);
    }
    jQuery.fx.timer(jQuery.extend(tick, {
      elem: elem,
      anim: animation,
      queue: animation.opts.queue
    }));
    return animation.progress(animation.opts.progress).done(animation.opts.done, animation.opts.complete).fail(animation.opts.fail).always(animation.opts.always);
  }
  jQuery.Animation = jQuery.extend(Animation, {
    tweener: function(props, callback) {
      if (jQuery.isFunction(props)) {
        callback = props;
        props = ["*"];
      } else {
        props = props.split(" ");
      }
      var prop,
          index = 0,
          length = props.length;
      for (; index < length; index++) {
        prop = props[index];
        tweeners[prop] = tweeners[prop] || [];
        tweeners[prop].unshift(callback);
      }
    },
    prefilter: function(callback, prepend) {
      if (prepend) {
        animationPrefilters.unshift(callback);
      } else {
        animationPrefilters.push(callback);
      }
    }
  });
  jQuery.speed = function(speed, easing, fn) {
    var opt = speed && typeof speed === "object" ? jQuery.extend({}, speed) : {
      complete: fn || !fn && easing || jQuery.isFunction(speed) && speed,
      duration: speed,
      easing: fn && easing || easing && !jQuery.isFunction(easing) && easing
    };
    opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration : opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[opt.duration] : jQuery.fx.speeds._default;
    if (opt.queue == null || opt.queue === true) {
      opt.queue = "fx";
    }
    opt.old = opt.complete;
    opt.complete = function() {
      if (jQuery.isFunction(opt.old)) {
        opt.old.call(this);
      }
      if (opt.queue) {
        jQuery.dequeue(this, opt.queue);
      }
    };
    return opt;
  };
  jQuery.fn.extend({
    fadeTo: function(speed, to, easing, callback) {
      return this.filter(isHidden).css("opacity", 0).show().end().animate({opacity: to}, speed, easing, callback);
    },
    animate: function(prop, speed, easing, callback) {
      var empty = jQuery.isEmptyObject(prop),
          optall = jQuery.speed(speed, easing, callback),
          doAnimation = function() {
            var anim = Animation(this, jQuery.extend({}, prop), optall);
            if (empty || data_priv.get(this, "finish")) {
              anim.stop(true);
            }
          };
      doAnimation.finish = doAnimation;
      return empty || optall.queue === false ? this.each(doAnimation) : this.queue(optall.queue, doAnimation);
    },
    stop: function(type, clearQueue, gotoEnd) {
      var stopQueue = function(hooks) {
        var stop = hooks.stop;
        delete hooks.stop;
        stop(gotoEnd);
      };
      if (typeof type !== "string") {
        gotoEnd = clearQueue;
        clearQueue = type;
        type = undefined;
      }
      if (clearQueue && type !== false) {
        this.queue(type || "fx", []);
      }
      return this.each(function() {
        var dequeue = true,
            index = type != null && type + "queueHooks",
            timers = jQuery.timers,
            data = data_priv.get(this);
        if (index) {
          if (data[index] && data[index].stop) {
            stopQueue(data[index]);
          }
        } else {
          for (index in data) {
            if (data[index] && data[index].stop && rrun.test(index)) {
              stopQueue(data[index]);
            }
          }
        }
        for (index = timers.length; index--; ) {
          if (timers[index].elem === this && (type == null || timers[index].queue === type)) {
            timers[index].anim.stop(gotoEnd);
            dequeue = false;
            timers.splice(index, 1);
          }
        }
        if (dequeue || !gotoEnd) {
          jQuery.dequeue(this, type);
        }
      });
    },
    finish: function(type) {
      if (type !== false) {
        type = type || "fx";
      }
      return this.each(function() {
        var index,
            data = data_priv.get(this),
            queue = data[type + "queue"],
            hooks = data[type + "queueHooks"],
            timers = jQuery.timers,
            length = queue ? queue.length : 0;
        data.finish = true;
        jQuery.queue(this, type, []);
        if (hooks && hooks.stop) {
          hooks.stop.call(this, true);
        }
        for (index = timers.length; index--; ) {
          if (timers[index].elem === this && timers[index].queue === type) {
            timers[index].anim.stop(true);
            timers.splice(index, 1);
          }
        }
        for (index = 0; index < length; index++) {
          if (queue[index] && queue[index].finish) {
            queue[index].finish.call(this);
          }
        }
        delete data.finish;
      });
    }
  });
  jQuery.each(["toggle", "show", "hide"], function(i, name) {
    var cssFn = jQuery.fn[name];
    jQuery.fn[name] = function(speed, easing, callback) {
      return speed == null || typeof speed === "boolean" ? cssFn.apply(this, arguments) : this.animate(genFx(name, true), speed, easing, callback);
    };
  });
  jQuery.each({
    slideDown: genFx("show"),
    slideUp: genFx("hide"),
    slideToggle: genFx("toggle"),
    fadeIn: {opacity: "show"},
    fadeOut: {opacity: "hide"},
    fadeToggle: {opacity: "toggle"}
  }, function(name, props) {
    jQuery.fn[name] = function(speed, easing, callback) {
      return this.animate(props, speed, easing, callback);
    };
  });
  jQuery.timers = [];
  jQuery.fx.tick = function() {
    var timer,
        i = 0,
        timers = jQuery.timers;
    fxNow = jQuery.now();
    for (; i < timers.length; i++) {
      timer = timers[i];
      if (!timer() && timers[i] === timer) {
        timers.splice(i--, 1);
      }
    }
    if (!timers.length) {
      jQuery.fx.stop();
    }
    fxNow = undefined;
  };
  jQuery.fx.timer = function(timer) {
    jQuery.timers.push(timer);
    if (timer()) {
      jQuery.fx.start();
    } else {
      jQuery.timers.pop();
    }
  };
  jQuery.fx.interval = 13;
  jQuery.fx.start = function() {
    if (!timerId) {
      timerId = setInterval(jQuery.fx.tick, jQuery.fx.interval);
    }
  };
  jQuery.fx.stop = function() {
    clearInterval(timerId);
    timerId = null;
  };
  jQuery.fx.speeds = {
    slow: 600,
    fast: 200,
    _default: 400
  };
  jQuery.fn.delay = function(time, type) {
    time = jQuery.fx ? jQuery.fx.speeds[time] || time : time;
    type = type || "fx";
    return this.queue(type, function(next, hooks) {
      var timeout = setTimeout(next, time);
      hooks.stop = function() {
        clearTimeout(timeout);
      };
    });
  };
  (function() {
    var input = document.createElement("input"),
        select = document.createElement("select"),
        opt = select.appendChild(document.createElement("option"));
    input.type = "checkbox";
    support.checkOn = input.value !== "";
    support.optSelected = opt.selected;
    select.disabled = true;
    support.optDisabled = !opt.disabled;
    input = document.createElement("input");
    input.value = "t";
    input.type = "radio";
    support.radioValue = input.value === "t";
  })();
  var nodeHook,
      boolHook,
      attrHandle = jQuery.expr.attrHandle;
  jQuery.fn.extend({
    attr: function(name, value) {
      return access(this, jQuery.attr, name, value, arguments.length > 1);
    },
    removeAttr: function(name) {
      return this.each(function() {
        jQuery.removeAttr(this, name);
      });
    }
  });
  jQuery.extend({
    attr: function(elem, name, value) {
      var hooks,
          ret,
          nType = elem.nodeType;
      if (!elem || nType === 3 || nType === 8 || nType === 2) {
        return;
      }
      if (typeof elem.getAttribute === strundefined) {
        return jQuery.prop(elem, name, value);
      }
      if (nType !== 1 || !jQuery.isXMLDoc(elem)) {
        name = name.toLowerCase();
        hooks = jQuery.attrHooks[name] || (jQuery.expr.match.bool.test(name) ? boolHook : nodeHook);
      }
      if (value !== undefined) {
        if (value === null) {
          jQuery.removeAttr(elem, name);
        } else if (hooks && "set" in hooks && (ret = hooks.set(elem, value, name)) !== undefined) {
          return ret;
        } else {
          elem.setAttribute(name, value + "");
          return value;
        }
      } else if (hooks && "get" in hooks && (ret = hooks.get(elem, name)) !== null) {
        return ret;
      } else {
        ret = jQuery.find.attr(elem, name);
        return ret == null ? undefined : ret;
      }
    },
    removeAttr: function(elem, value) {
      var name,
          propName,
          i = 0,
          attrNames = value && value.match(rnotwhite);
      if (attrNames && elem.nodeType === 1) {
        while ((name = attrNames[i++])) {
          propName = jQuery.propFix[name] || name;
          if (jQuery.expr.match.bool.test(name)) {
            elem[propName] = false;
          }
          elem.removeAttribute(name);
        }
      }
    },
    attrHooks: {type: {set: function(elem, value) {
          if (!support.radioValue && value === "radio" && jQuery.nodeName(elem, "input")) {
            var val = elem.value;
            elem.setAttribute("type", value);
            if (val) {
              elem.value = val;
            }
            return value;
          }
        }}}
  });
  boolHook = {set: function(elem, value, name) {
      if (value === false) {
        jQuery.removeAttr(elem, name);
      } else {
        elem.setAttribute(name, name);
      }
      return name;
    }};
  jQuery.each(jQuery.expr.match.bool.source.match(/\w+/g), function(i, name) {
    var getter = attrHandle[name] || jQuery.find.attr;
    attrHandle[name] = function(elem, name, isXML) {
      var ret,
          handle;
      if (!isXML) {
        handle = attrHandle[name];
        attrHandle[name] = ret;
        ret = getter(elem, name, isXML) != null ? name.toLowerCase() : null;
        attrHandle[name] = handle;
      }
      return ret;
    };
  });
  var rfocusable = /^(?:input|select|textarea|button)$/i;
  jQuery.fn.extend({
    prop: function(name, value) {
      return access(this, jQuery.prop, name, value, arguments.length > 1);
    },
    removeProp: function(name) {
      return this.each(function() {
        delete this[jQuery.propFix[name] || name];
      });
    }
  });
  jQuery.extend({
    propFix: {
      "for": "htmlFor",
      "class": "className"
    },
    prop: function(elem, name, value) {
      var ret,
          hooks,
          notxml,
          nType = elem.nodeType;
      if (!elem || nType === 3 || nType === 8 || nType === 2) {
        return;
      }
      notxml = nType !== 1 || !jQuery.isXMLDoc(elem);
      if (notxml) {
        name = jQuery.propFix[name] || name;
        hooks = jQuery.propHooks[name];
      }
      if (value !== undefined) {
        return hooks && "set" in hooks && (ret = hooks.set(elem, value, name)) !== undefined ? ret : (elem[name] = value);
      } else {
        return hooks && "get" in hooks && (ret = hooks.get(elem, name)) !== null ? ret : elem[name];
      }
    },
    propHooks: {tabIndex: {get: function(elem) {
          return elem.hasAttribute("tabindex") || rfocusable.test(elem.nodeName) || elem.href ? elem.tabIndex : -1;
        }}}
  });
  if (!support.optSelected) {
    jQuery.propHooks.selected = {get: function(elem) {
        var parent = elem.parentNode;
        if (parent && parent.parentNode) {
          parent.parentNode.selectedIndex;
        }
        return null;
      }};
  }
  jQuery.each(["tabIndex", "readOnly", "maxLength", "cellSpacing", "cellPadding", "rowSpan", "colSpan", "useMap", "frameBorder", "contentEditable"], function() {
    jQuery.propFix[this.toLowerCase()] = this;
  });
  var rclass = /[\t\r\n\f]/g;
  jQuery.fn.extend({
    addClass: function(value) {
      var classes,
          elem,
          cur,
          clazz,
          j,
          finalValue,
          proceed = typeof value === "string" && value,
          i = 0,
          len = this.length;
      if (jQuery.isFunction(value)) {
        return this.each(function(j) {
          jQuery(this).addClass(value.call(this, j, this.className));
        });
      }
      if (proceed) {
        classes = (value || "").match(rnotwhite) || [];
        for (; i < len; i++) {
          elem = this[i];
          cur = elem.nodeType === 1 && (elem.className ? (" " + elem.className + " ").replace(rclass, " ") : " ");
          if (cur) {
            j = 0;
            while ((clazz = classes[j++])) {
              if (cur.indexOf(" " + clazz + " ") < 0) {
                cur += clazz + " ";
              }
            }
            finalValue = jQuery.trim(cur);
            if (elem.className !== finalValue) {
              elem.className = finalValue;
            }
          }
        }
      }
      return this;
    },
    removeClass: function(value) {
      var classes,
          elem,
          cur,
          clazz,
          j,
          finalValue,
          proceed = arguments.length === 0 || typeof value === "string" && value,
          i = 0,
          len = this.length;
      if (jQuery.isFunction(value)) {
        return this.each(function(j) {
          jQuery(this).removeClass(value.call(this, j, this.className));
        });
      }
      if (proceed) {
        classes = (value || "").match(rnotwhite) || [];
        for (; i < len; i++) {
          elem = this[i];
          cur = elem.nodeType === 1 && (elem.className ? (" " + elem.className + " ").replace(rclass, " ") : "");
          if (cur) {
            j = 0;
            while ((clazz = classes[j++])) {
              while (cur.indexOf(" " + clazz + " ") >= 0) {
                cur = cur.replace(" " + clazz + " ", " ");
              }
            }
            finalValue = value ? jQuery.trim(cur) : "";
            if (elem.className !== finalValue) {
              elem.className = finalValue;
            }
          }
        }
      }
      return this;
    },
    toggleClass: function(value, stateVal) {
      var type = typeof value;
      if (typeof stateVal === "boolean" && type === "string") {
        return stateVal ? this.addClass(value) : this.removeClass(value);
      }
      if (jQuery.isFunction(value)) {
        return this.each(function(i) {
          jQuery(this).toggleClass(value.call(this, i, this.className, stateVal), stateVal);
        });
      }
      return this.each(function() {
        if (type === "string") {
          var className,
              i = 0,
              self = jQuery(this),
              classNames = value.match(rnotwhite) || [];
          while ((className = classNames[i++])) {
            if (self.hasClass(className)) {
              self.removeClass(className);
            } else {
              self.addClass(className);
            }
          }
        } else if (type === strundefined || type === "boolean") {
          if (this.className) {
            data_priv.set(this, "__className__", this.className);
          }
          this.className = this.className || value === false ? "" : data_priv.get(this, "__className__") || "";
        }
      });
    },
    hasClass: function(selector) {
      var className = " " + selector + " ",
          i = 0,
          l = this.length;
      for (; i < l; i++) {
        if (this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf(className) >= 0) {
          return true;
        }
      }
      return false;
    }
  });
  var rreturn = /\r/g;
  jQuery.fn.extend({val: function(value) {
      var hooks,
          ret,
          isFunction,
          elem = this[0];
      if (!arguments.length) {
        if (elem) {
          hooks = jQuery.valHooks[elem.type] || jQuery.valHooks[elem.nodeName.toLowerCase()];
          if (hooks && "get" in hooks && (ret = hooks.get(elem, "value")) !== undefined) {
            return ret;
          }
          ret = elem.value;
          return typeof ret === "string" ? ret.replace(rreturn, "") : ret == null ? "" : ret;
        }
        return;
      }
      isFunction = jQuery.isFunction(value);
      return this.each(function(i) {
        var val;
        if (this.nodeType !== 1) {
          return;
        }
        if (isFunction) {
          val = value.call(this, i, jQuery(this).val());
        } else {
          val = value;
        }
        if (val == null) {
          val = "";
        } else if (typeof val === "number") {
          val += "";
        } else if (jQuery.isArray(val)) {
          val = jQuery.map(val, function(value) {
            return value == null ? "" : value + "";
          });
        }
        hooks = jQuery.valHooks[this.type] || jQuery.valHooks[this.nodeName.toLowerCase()];
        if (!hooks || !("set" in hooks) || hooks.set(this, val, "value") === undefined) {
          this.value = val;
        }
      });
    }});
  jQuery.extend({valHooks: {
      option: {get: function(elem) {
          var val = jQuery.find.attr(elem, "value");
          return val != null ? val : jQuery.trim(jQuery.text(elem));
        }},
      select: {
        get: function(elem) {
          var value,
              option,
              options = elem.options,
              index = elem.selectedIndex,
              one = elem.type === "select-one" || index < 0,
              values = one ? null : [],
              max = one ? index + 1 : options.length,
              i = index < 0 ? max : one ? index : 0;
          for (; i < max; i++) {
            option = options[i];
            if ((option.selected || i === index) && (support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null) && (!option.parentNode.disabled || !jQuery.nodeName(option.parentNode, "optgroup"))) {
              value = jQuery(option).val();
              if (one) {
                return value;
              }
              values.push(value);
            }
          }
          return values;
        },
        set: function(elem, value) {
          var optionSet,
              option,
              options = elem.options,
              values = jQuery.makeArray(value),
              i = options.length;
          while (i--) {
            option = options[i];
            if ((option.selected = jQuery.inArray(option.value, values) >= 0)) {
              optionSet = true;
            }
          }
          if (!optionSet) {
            elem.selectedIndex = -1;
          }
          return values;
        }
      }
    }});
  jQuery.each(["radio", "checkbox"], function() {
    jQuery.valHooks[this] = {set: function(elem, value) {
        if (jQuery.isArray(value)) {
          return (elem.checked = jQuery.inArray(jQuery(elem).val(), value) >= 0);
        }
      }};
    if (!support.checkOn) {
      jQuery.valHooks[this].get = function(elem) {
        return elem.getAttribute("value") === null ? "on" : elem.value;
      };
    }
  });
  jQuery.each(("blur focus focusin focusout load resize scroll unload click dblclick " + "mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " + "change select submit keydown keypress keyup error contextmenu").split(" "), function(i, name) {
    jQuery.fn[name] = function(data, fn) {
      return arguments.length > 0 ? this.on(name, null, data, fn) : this.trigger(name);
    };
  });
  jQuery.fn.extend({
    hover: function(fnOver, fnOut) {
      return this.mouseenter(fnOver).mouseleave(fnOut || fnOver);
    },
    bind: function(types, data, fn) {
      return this.on(types, null, data, fn);
    },
    unbind: function(types, fn) {
      return this.off(types, null, fn);
    },
    delegate: function(selector, types, data, fn) {
      return this.on(types, selector, data, fn);
    },
    undelegate: function(selector, types, fn) {
      return arguments.length === 1 ? this.off(selector, "**") : this.off(types, selector || "**", fn);
    }
  });
  var nonce = jQuery.now();
  var rquery = (/\?/);
  jQuery.parseJSON = function(data) {
    return JSON.parse(data + "");
  };
  jQuery.parseXML = function(data) {
    var xml,
        tmp;
    if (!data || typeof data !== "string") {
      return null;
    }
    try {
      tmp = new DOMParser();
      xml = tmp.parseFromString(data, "text/xml");
    } catch (e) {
      xml = undefined;
    }
    if (!xml || xml.getElementsByTagName("parsererror").length) {
      jQuery.error("Invalid XML: " + data);
    }
    return xml;
  };
  var rhash = /#.*$/,
      rts = /([?&])_=[^&]*/,
      rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
      rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
      rnoContent = /^(?:GET|HEAD)$/,
      rprotocol = /^\/\//,
      rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,
      prefilters = {},
      transports = {},
      allTypes = "*/".concat("*"),
      ajaxLocation = window.location.href,
      ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || [];
  function addToPrefiltersOrTransports(structure) {
    return function(dataTypeExpression, func) {
      if (typeof dataTypeExpression !== "string") {
        func = dataTypeExpression;
        dataTypeExpression = "*";
      }
      var dataType,
          i = 0,
          dataTypes = dataTypeExpression.toLowerCase().match(rnotwhite) || [];
      if (jQuery.isFunction(func)) {
        while ((dataType = dataTypes[i++])) {
          if (dataType[0] === "+") {
            dataType = dataType.slice(1) || "*";
            (structure[dataType] = structure[dataType] || []).unshift(func);
          } else {
            (structure[dataType] = structure[dataType] || []).push(func);
          }
        }
      }
    };
  }
  function inspectPrefiltersOrTransports(structure, options, originalOptions, jqXHR) {
    var inspected = {},
        seekingTransport = (structure === transports);
    function inspect(dataType) {
      var selected;
      inspected[dataType] = true;
      jQuery.each(structure[dataType] || [], function(_, prefilterOrFactory) {
        var dataTypeOrTransport = prefilterOrFactory(options, originalOptions, jqXHR);
        if (typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[dataTypeOrTransport]) {
          options.dataTypes.unshift(dataTypeOrTransport);
          inspect(dataTypeOrTransport);
          return false;
        } else if (seekingTransport) {
          return !(selected = dataTypeOrTransport);
        }
      });
      return selected;
    }
    return inspect(options.dataTypes[0]) || !inspected["*"] && inspect("*");
  }
  function ajaxExtend(target, src) {
    var key,
        deep,
        flatOptions = jQuery.ajaxSettings.flatOptions || {};
    for (key in src) {
      if (src[key] !== undefined) {
        (flatOptions[key] ? target : (deep || (deep = {})))[key] = src[key];
      }
    }
    if (deep) {
      jQuery.extend(true, target, deep);
    }
    return target;
  }
  function ajaxHandleResponses(s, jqXHR, responses) {
    var ct,
        type,
        finalDataType,
        firstDataType,
        contents = s.contents,
        dataTypes = s.dataTypes;
    while (dataTypes[0] === "*") {
      dataTypes.shift();
      if (ct === undefined) {
        ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
      }
    }
    if (ct) {
      for (type in contents) {
        if (contents[type] && contents[type].test(ct)) {
          dataTypes.unshift(type);
          break;
        }
      }
    }
    if (dataTypes[0] in responses) {
      finalDataType = dataTypes[0];
    } else {
      for (type in responses) {
        if (!dataTypes[0] || s.converters[type + " " + dataTypes[0]]) {
          finalDataType = type;
          break;
        }
        if (!firstDataType) {
          firstDataType = type;
        }
      }
      finalDataType = finalDataType || firstDataType;
    }
    if (finalDataType) {
      if (finalDataType !== dataTypes[0]) {
        dataTypes.unshift(finalDataType);
      }
      return responses[finalDataType];
    }
  }
  function ajaxConvert(s, response, jqXHR, isSuccess) {
    var conv2,
        current,
        conv,
        tmp,
        prev,
        converters = {},
        dataTypes = s.dataTypes.slice();
    if (dataTypes[1]) {
      for (conv in s.converters) {
        converters[conv.toLowerCase()] = s.converters[conv];
      }
    }
    current = dataTypes.shift();
    while (current) {
      if (s.responseFields[current]) {
        jqXHR[s.responseFields[current]] = response;
      }
      if (!prev && isSuccess && s.dataFilter) {
        response = s.dataFilter(response, s.dataType);
      }
      prev = current;
      current = dataTypes.shift();
      if (current) {
        if (current === "*") {
          current = prev;
        } else if (prev !== "*" && prev !== current) {
          conv = converters[prev + " " + current] || converters["* " + current];
          if (!conv) {
            for (conv2 in converters) {
              tmp = conv2.split(" ");
              if (tmp[1] === current) {
                conv = converters[prev + " " + tmp[0]] || converters["* " + tmp[0]];
                if (conv) {
                  if (conv === true) {
                    conv = converters[conv2];
                  } else if (converters[conv2] !== true) {
                    current = tmp[0];
                    dataTypes.unshift(tmp[1]);
                  }
                  break;
                }
              }
            }
          }
          if (conv !== true) {
            if (conv && s["throws"]) {
              response = conv(response);
            } else {
              try {
                response = conv(response);
              } catch (e) {
                return {
                  state: "parsererror",
                  error: conv ? e : "No conversion from " + prev + " to " + current
                };
              }
            }
          }
        }
      }
    }
    return {
      state: "success",
      data: response
    };
  }
  jQuery.extend({
    active: 0,
    lastModified: {},
    etag: {},
    ajaxSettings: {
      url: ajaxLocation,
      type: "GET",
      isLocal: rlocalProtocol.test(ajaxLocParts[1]),
      global: true,
      processData: true,
      async: true,
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
      accepts: {
        "*": allTypes,
        text: "text/plain",
        html: "text/html",
        xml: "application/xml, text/xml",
        json: "application/json, text/javascript"
      },
      contents: {
        xml: /xml/,
        html: /html/,
        json: /json/
      },
      responseFields: {
        xml: "responseXML",
        text: "responseText",
        json: "responseJSON"
      },
      converters: {
        "* text": String,
        "text html": true,
        "text json": jQuery.parseJSON,
        "text xml": jQuery.parseXML
      },
      flatOptions: {
        url: true,
        context: true
      }
    },
    ajaxSetup: function(target, settings) {
      return settings ? ajaxExtend(ajaxExtend(target, jQuery.ajaxSettings), settings) : ajaxExtend(jQuery.ajaxSettings, target);
    },
    ajaxPrefilter: addToPrefiltersOrTransports(prefilters),
    ajaxTransport: addToPrefiltersOrTransports(transports),
    ajax: function(url, options) {
      if (typeof url === "object") {
        options = url;
        url = undefined;
      }
      options = options || {};
      var transport,
          cacheURL,
          responseHeadersString,
          responseHeaders,
          timeoutTimer,
          parts,
          fireGlobals,
          i,
          s = jQuery.ajaxSetup({}, options),
          callbackContext = s.context || s,
          globalEventContext = s.context && (callbackContext.nodeType || callbackContext.jquery) ? jQuery(callbackContext) : jQuery.event,
          deferred = jQuery.Deferred(),
          completeDeferred = jQuery.Callbacks("once memory"),
          statusCode = s.statusCode || {},
          requestHeaders = {},
          requestHeadersNames = {},
          state = 0,
          strAbort = "canceled",
          jqXHR = {
            readyState: 0,
            getResponseHeader: function(key) {
              var match;
              if (state === 2) {
                if (!responseHeaders) {
                  responseHeaders = {};
                  while ((match = rheaders.exec(responseHeadersString))) {
                    responseHeaders[match[1].toLowerCase()] = match[2];
                  }
                }
                match = responseHeaders[key.toLowerCase()];
              }
              return match == null ? null : match;
            },
            getAllResponseHeaders: function() {
              return state === 2 ? responseHeadersString : null;
            },
            setRequestHeader: function(name, value) {
              var lname = name.toLowerCase();
              if (!state) {
                name = requestHeadersNames[lname] = requestHeadersNames[lname] || name;
                requestHeaders[name] = value;
              }
              return this;
            },
            overrideMimeType: function(type) {
              if (!state) {
                s.mimeType = type;
              }
              return this;
            },
            statusCode: function(map) {
              var code;
              if (map) {
                if (state < 2) {
                  for (code in map) {
                    statusCode[code] = [statusCode[code], map[code]];
                  }
                } else {
                  jqXHR.always(map[jqXHR.status]);
                }
              }
              return this;
            },
            abort: function(statusText) {
              var finalText = statusText || strAbort;
              if (transport) {
                transport.abort(finalText);
              }
              done(0, finalText);
              return this;
            }
          };
      deferred.promise(jqXHR).complete = completeDeferred.add;
      jqXHR.success = jqXHR.done;
      jqXHR.error = jqXHR.fail;
      s.url = ((url || s.url || ajaxLocation) + "").replace(rhash, "").replace(rprotocol, ajaxLocParts[1] + "//");
      s.type = options.method || options.type || s.method || s.type;
      s.dataTypes = jQuery.trim(s.dataType || "*").toLowerCase().match(rnotwhite) || [""];
      if (s.crossDomain == null) {
        parts = rurl.exec(s.url.toLowerCase());
        s.crossDomain = !!(parts && (parts[1] !== ajaxLocParts[1] || parts[2] !== ajaxLocParts[2] || (parts[3] || (parts[1] === "http:" ? "80" : "443")) !== (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? "80" : "443"))));
      }
      if (s.data && s.processData && typeof s.data !== "string") {
        s.data = jQuery.param(s.data, s.traditional);
      }
      inspectPrefiltersOrTransports(prefilters, s, options, jqXHR);
      if (state === 2) {
        return jqXHR;
      }
      fireGlobals = jQuery.event && s.global;
      if (fireGlobals && jQuery.active++ === 0) {
        jQuery.event.trigger("ajaxStart");
      }
      s.type = s.type.toUpperCase();
      s.hasContent = !rnoContent.test(s.type);
      cacheURL = s.url;
      if (!s.hasContent) {
        if (s.data) {
          cacheURL = (s.url += (rquery.test(cacheURL) ? "&" : "?") + s.data);
          delete s.data;
        }
        if (s.cache === false) {
          s.url = rts.test(cacheURL) ? cacheURL.replace(rts, "$1_=" + nonce++) : cacheURL + (rquery.test(cacheURL) ? "&" : "?") + "_=" + nonce++;
        }
      }
      if (s.ifModified) {
        if (jQuery.lastModified[cacheURL]) {
          jqXHR.setRequestHeader("If-Modified-Since", jQuery.lastModified[cacheURL]);
        }
        if (jQuery.etag[cacheURL]) {
          jqXHR.setRequestHeader("If-None-Match", jQuery.etag[cacheURL]);
        }
      }
      if (s.data && s.hasContent && s.contentType !== false || options.contentType) {
        jqXHR.setRequestHeader("Content-Type", s.contentType);
      }
      jqXHR.setRequestHeader("Accept", s.dataTypes[0] && s.accepts[s.dataTypes[0]] ? s.accepts[s.dataTypes[0]] + (s.dataTypes[0] !== "*" ? ", " + allTypes + "; q=0.01" : "") : s.accepts["*"]);
      for (i in s.headers) {
        jqXHR.setRequestHeader(i, s.headers[i]);
      }
      if (s.beforeSend && (s.beforeSend.call(callbackContext, jqXHR, s) === false || state === 2)) {
        return jqXHR.abort();
      }
      strAbort = "abort";
      for (i in {
        success: 1,
        error: 1,
        complete: 1
      }) {
        jqXHR[i](s[i]);
      }
      transport = inspectPrefiltersOrTransports(transports, s, options, jqXHR);
      if (!transport) {
        done(-1, "No Transport");
      } else {
        jqXHR.readyState = 1;
        if (fireGlobals) {
          globalEventContext.trigger("ajaxSend", [jqXHR, s]);
        }
        if (s.async && s.timeout > 0) {
          timeoutTimer = setTimeout(function() {
            jqXHR.abort("timeout");
          }, s.timeout);
        }
        try {
          state = 1;
          transport.send(requestHeaders, done);
        } catch (e) {
          if (state < 2) {
            done(-1, e);
          } else {
            throw e;
          }
        }
      }
      function done(status, nativeStatusText, responses, headers) {
        var isSuccess,
            success,
            error,
            response,
            modified,
            statusText = nativeStatusText;
        if (state === 2) {
          return;
        }
        state = 2;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        transport = undefined;
        responseHeadersString = headers || "";
        jqXHR.readyState = status > 0 ? 4 : 0;
        isSuccess = status >= 200 && status < 300 || status === 304;
        if (responses) {
          response = ajaxHandleResponses(s, jqXHR, responses);
        }
        response = ajaxConvert(s, response, jqXHR, isSuccess);
        if (isSuccess) {
          if (s.ifModified) {
            modified = jqXHR.getResponseHeader("Last-Modified");
            if (modified) {
              jQuery.lastModified[cacheURL] = modified;
            }
            modified = jqXHR.getResponseHeader("etag");
            if (modified) {
              jQuery.etag[cacheURL] = modified;
            }
          }
          if (status === 204 || s.type === "HEAD") {
            statusText = "nocontent";
          } else if (status === 304) {
            statusText = "notmodified";
          } else {
            statusText = response.state;
            success = response.data;
            error = response.error;
            isSuccess = !error;
          }
        } else {
          error = statusText;
          if (status || !statusText) {
            statusText = "error";
            if (status < 0) {
              status = 0;
            }
          }
        }
        jqXHR.status = status;
        jqXHR.statusText = (nativeStatusText || statusText) + "";
        if (isSuccess) {
          deferred.resolveWith(callbackContext, [success, statusText, jqXHR]);
        } else {
          deferred.rejectWith(callbackContext, [jqXHR, statusText, error]);
        }
        jqXHR.statusCode(statusCode);
        statusCode = undefined;
        if (fireGlobals) {
          globalEventContext.trigger(isSuccess ? "ajaxSuccess" : "ajaxError", [jqXHR, s, isSuccess ? success : error]);
        }
        completeDeferred.fireWith(callbackContext, [jqXHR, statusText]);
        if (fireGlobals) {
          globalEventContext.trigger("ajaxComplete", [jqXHR, s]);
          if (!(--jQuery.active)) {
            jQuery.event.trigger("ajaxStop");
          }
        }
      }
      return jqXHR;
    },
    getJSON: function(url, data, callback) {
      return jQuery.get(url, data, callback, "json");
    },
    getScript: function(url, callback) {
      return jQuery.get(url, undefined, callback, "script");
    }
  });
  jQuery.each(["get", "post"], function(i, method) {
    jQuery[method] = function(url, data, callback, type) {
      if (jQuery.isFunction(data)) {
        type = type || callback;
        callback = data;
        data = undefined;
      }
      return jQuery.ajax({
        url: url,
        type: method,
        dataType: type,
        data: data,
        success: callback
      });
    };
  });
  jQuery._evalUrl = function(url) {
    return jQuery.ajax({
      url: url,
      type: "GET",
      dataType: "script",
      async: false,
      global: false,
      "throws": true
    });
  };
  jQuery.fn.extend({
    wrapAll: function(html) {
      var wrap;
      if (jQuery.isFunction(html)) {
        return this.each(function(i) {
          jQuery(this).wrapAll(html.call(this, i));
        });
      }
      if (this[0]) {
        wrap = jQuery(html, this[0].ownerDocument).eq(0).clone(true);
        if (this[0].parentNode) {
          wrap.insertBefore(this[0]);
        }
        wrap.map(function() {
          var elem = this;
          while (elem.firstElementChild) {
            elem = elem.firstElementChild;
          }
          return elem;
        }).append(this);
      }
      return this;
    },
    wrapInner: function(html) {
      if (jQuery.isFunction(html)) {
        return this.each(function(i) {
          jQuery(this).wrapInner(html.call(this, i));
        });
      }
      return this.each(function() {
        var self = jQuery(this),
            contents = self.contents();
        if (contents.length) {
          contents.wrapAll(html);
        } else {
          self.append(html);
        }
      });
    },
    wrap: function(html) {
      var isFunction = jQuery.isFunction(html);
      return this.each(function(i) {
        jQuery(this).wrapAll(isFunction ? html.call(this, i) : html);
      });
    },
    unwrap: function() {
      return this.parent().each(function() {
        if (!jQuery.nodeName(this, "body")) {
          jQuery(this).replaceWith(this.childNodes);
        }
      }).end();
    }
  });
  jQuery.expr.filters.hidden = function(elem) {
    return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
  };
  jQuery.expr.filters.visible = function(elem) {
    return !jQuery.expr.filters.hidden(elem);
  };
  var r20 = /%20/g,
      rbracket = /\[\]$/,
      rCRLF = /\r?\n/g,
      rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
      rsubmittable = /^(?:input|select|textarea|keygen)/i;
  function buildParams(prefix, obj, traditional, add) {
    var name;
    if (jQuery.isArray(obj)) {
      jQuery.each(obj, function(i, v) {
        if (traditional || rbracket.test(prefix)) {
          add(prefix, v);
        } else {
          buildParams(prefix + "[" + (typeof v === "object" ? i : "") + "]", v, traditional, add);
        }
      });
    } else if (!traditional && jQuery.type(obj) === "object") {
      for (name in obj) {
        buildParams(prefix + "[" + name + "]", obj[name], traditional, add);
      }
    } else {
      add(prefix, obj);
    }
  }
  jQuery.param = function(a, traditional) {
    var prefix,
        s = [],
        add = function(key, value) {
          value = jQuery.isFunction(value) ? value() : (value == null ? "" : value);
          s[s.length] = encodeURIComponent(key) + "=" + encodeURIComponent(value);
        };
    if (traditional === undefined) {
      traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
    }
    if (jQuery.isArray(a) || (a.jquery && !jQuery.isPlainObject(a))) {
      jQuery.each(a, function() {
        add(this.name, this.value);
      });
    } else {
      for (prefix in a) {
        buildParams(prefix, a[prefix], traditional, add);
      }
    }
    return s.join("&").replace(r20, "+");
  };
  jQuery.fn.extend({
    serialize: function() {
      return jQuery.param(this.serializeArray());
    },
    serializeArray: function() {
      return this.map(function() {
        var elements = jQuery.prop(this, "elements");
        return elements ? jQuery.makeArray(elements) : this;
      }).filter(function() {
        var type = this.type;
        return this.name && !jQuery(this).is(":disabled") && rsubmittable.test(this.nodeName) && !rsubmitterTypes.test(type) && (this.checked || !rcheckableType.test(type));
      }).map(function(i, elem) {
        var val = jQuery(this).val();
        return val == null ? null : jQuery.isArray(val) ? jQuery.map(val, function(val) {
          return {
            name: elem.name,
            value: val.replace(rCRLF, "\r\n")
          };
        }) : {
          name: elem.name,
          value: val.replace(rCRLF, "\r\n")
        };
      }).get();
    }
  });
  jQuery.ajaxSettings.xhr = function() {
    try {
      return new XMLHttpRequest();
    } catch (e) {}
  };
  var xhrId = 0,
      xhrCallbacks = {},
      xhrSuccessStatus = {
        0: 200,
        1223: 204
      },
      xhrSupported = jQuery.ajaxSettings.xhr();
  if (window.attachEvent) {
    window.attachEvent("onunload", function() {
      for (var key in xhrCallbacks) {
        xhrCallbacks[key]();
      }
    });
  }
  support.cors = !!xhrSupported && ("withCredentials" in xhrSupported);
  support.ajax = xhrSupported = !!xhrSupported;
  jQuery.ajaxTransport(function(options) {
    var callback;
    if (support.cors || xhrSupported && !options.crossDomain) {
      return {
        send: function(headers, complete) {
          var i,
              xhr = options.xhr(),
              id = ++xhrId;
          xhr.open(options.type, options.url, options.async, options.username, options.password);
          if (options.xhrFields) {
            for (i in options.xhrFields) {
              xhr[i] = options.xhrFields[i];
            }
          }
          if (options.mimeType && xhr.overrideMimeType) {
            xhr.overrideMimeType(options.mimeType);
          }
          if (!options.crossDomain && !headers["X-Requested-With"]) {
            headers["X-Requested-With"] = "XMLHttpRequest";
          }
          for (i in headers) {
            xhr.setRequestHeader(i, headers[i]);
          }
          callback = function(type) {
            return function() {
              if (callback) {
                delete xhrCallbacks[id];
                callback = xhr.onload = xhr.onerror = null;
                if (type === "abort") {
                  xhr.abort();
                } else if (type === "error") {
                  complete(xhr.status, xhr.statusText);
                } else {
                  complete(xhrSuccessStatus[xhr.status] || xhr.status, xhr.statusText, typeof xhr.responseText === "string" ? {text: xhr.responseText} : undefined, xhr.getAllResponseHeaders());
                }
              }
            };
          };
          xhr.onload = callback();
          xhr.onerror = callback("error");
          callback = xhrCallbacks[id] = callback("abort");
          try {
            xhr.send(options.hasContent && options.data || null);
          } catch (e) {
            if (callback) {
              throw e;
            }
          }
        },
        abort: function() {
          if (callback) {
            callback();
          }
        }
      };
    }
  });
  jQuery.ajaxSetup({
    accepts: {script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},
    contents: {script: /(?:java|ecma)script/},
    converters: {"text script": function(text) {
        jQuery.globalEval(text);
        return text;
      }}
  });
  jQuery.ajaxPrefilter("script", function(s) {
    if (s.cache === undefined) {
      s.cache = false;
    }
    if (s.crossDomain) {
      s.type = "GET";
    }
  });
  jQuery.ajaxTransport("script", function(s) {
    if (s.crossDomain) {
      var script,
          callback;
      return {
        send: function(_, complete) {
          script = jQuery("<script>").prop({
            async: true,
            charset: s.scriptCharset,
            src: s.url
          }).on("load error", callback = function(evt) {
            script.remove();
            callback = null;
            if (evt) {
              complete(evt.type === "error" ? 404 : 200, evt.type);
            }
          });
          document.head.appendChild(script[0]);
        },
        abort: function() {
          if (callback) {
            callback();
          }
        }
      };
    }
  });
  var oldCallbacks = [],
      rjsonp = /(=)\?(?=&|$)|\?\?/;
  jQuery.ajaxSetup({
    jsonp: "callback",
    jsonpCallback: function() {
      var callback = oldCallbacks.pop() || (jQuery.expando + "_" + (nonce++));
      this[callback] = true;
      return callback;
    }
  });
  jQuery.ajaxPrefilter("json jsonp", function(s, originalSettings, jqXHR) {
    var callbackName,
        overwritten,
        responseContainer,
        jsonProp = s.jsonp !== false && (rjsonp.test(s.url) ? "url" : typeof s.data === "string" && !(s.contentType || "").indexOf("application/x-www-form-urlencoded") && rjsonp.test(s.data) && "data");
    if (jsonProp || s.dataTypes[0] === "jsonp") {
      callbackName = s.jsonpCallback = jQuery.isFunction(s.jsonpCallback) ? s.jsonpCallback() : s.jsonpCallback;
      if (jsonProp) {
        s[jsonProp] = s[jsonProp].replace(rjsonp, "$1" + callbackName);
      } else if (s.jsonp !== false) {
        s.url += (rquery.test(s.url) ? "&" : "?") + s.jsonp + "=" + callbackName;
      }
      s.converters["script json"] = function() {
        if (!responseContainer) {
          jQuery.error(callbackName + " was not called");
        }
        return responseContainer[0];
      };
      s.dataTypes[0] = "json";
      overwritten = window[callbackName];
      window[callbackName] = function() {
        responseContainer = arguments;
      };
      jqXHR.always(function() {
        window[callbackName] = overwritten;
        if (s[callbackName]) {
          s.jsonpCallback = originalSettings.jsonpCallback;
          oldCallbacks.push(callbackName);
        }
        if (responseContainer && jQuery.isFunction(overwritten)) {
          overwritten(responseContainer[0]);
        }
        responseContainer = overwritten = undefined;
      });
      return "script";
    }
  });
  jQuery.parseHTML = function(data, context, keepScripts) {
    if (!data || typeof data !== "string") {
      return null;
    }
    if (typeof context === "boolean") {
      keepScripts = context;
      context = false;
    }
    context = context || document;
    var parsed = rsingleTag.exec(data),
        scripts = !keepScripts && [];
    if (parsed) {
      return [context.createElement(parsed[1])];
    }
    parsed = jQuery.buildFragment([data], context, scripts);
    if (scripts && scripts.length) {
      jQuery(scripts).remove();
    }
    return jQuery.merge([], parsed.childNodes);
  };
  var _load = jQuery.fn.load;
  jQuery.fn.load = function(url, params, callback) {
    if (typeof url !== "string" && _load) {
      return _load.apply(this, arguments);
    }
    var selector,
        type,
        response,
        self = this,
        off = url.indexOf(" ");
    if (off >= 0) {
      selector = jQuery.trim(url.slice(off));
      url = url.slice(0, off);
    }
    if (jQuery.isFunction(params)) {
      callback = params;
      params = undefined;
    } else if (params && typeof params === "object") {
      type = "POST";
    }
    if (self.length > 0) {
      jQuery.ajax({
        url: url,
        type: type,
        dataType: "html",
        data: params
      }).done(function(responseText) {
        response = arguments;
        self.html(selector ? jQuery("<div>").append(jQuery.parseHTML(responseText)).find(selector) : responseText);
      }).complete(callback && function(jqXHR, status) {
        self.each(callback, response || [jqXHR.responseText, status, jqXHR]);
      });
    }
    return this;
  };
  jQuery.each(["ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend"], function(i, type) {
    jQuery.fn[type] = function(fn) {
      return this.on(type, fn);
    };
  });
  jQuery.expr.filters.animated = function(elem) {
    return jQuery.grep(jQuery.timers, function(fn) {
      return elem === fn.elem;
    }).length;
  };
  var docElem = window.document.documentElement;
  function getWindow(elem) {
    return jQuery.isWindow(elem) ? elem : elem.nodeType === 9 && elem.defaultView;
  }
  jQuery.offset = {setOffset: function(elem, options, i) {
      var curPosition,
          curLeft,
          curCSSTop,
          curTop,
          curOffset,
          curCSSLeft,
          calculatePosition,
          position = jQuery.css(elem, "position"),
          curElem = jQuery(elem),
          props = {};
      if (position === "static") {
        elem.style.position = "relative";
      }
      curOffset = curElem.offset();
      curCSSTop = jQuery.css(elem, "top");
      curCSSLeft = jQuery.css(elem, "left");
      calculatePosition = (position === "absolute" || position === "fixed") && (curCSSTop + curCSSLeft).indexOf("auto") > -1;
      if (calculatePosition) {
        curPosition = curElem.position();
        curTop = curPosition.top;
        curLeft = curPosition.left;
      } else {
        curTop = parseFloat(curCSSTop) || 0;
        curLeft = parseFloat(curCSSLeft) || 0;
      }
      if (jQuery.isFunction(options)) {
        options = options.call(elem, i, curOffset);
      }
      if (options.top != null) {
        props.top = (options.top - curOffset.top) + curTop;
      }
      if (options.left != null) {
        props.left = (options.left - curOffset.left) + curLeft;
      }
      if ("using" in options) {
        options.using.call(elem, props);
      } else {
        curElem.css(props);
      }
    }};
  jQuery.fn.extend({
    offset: function(options) {
      if (arguments.length) {
        return options === undefined ? this : this.each(function(i) {
          jQuery.offset.setOffset(this, options, i);
        });
      }
      var docElem,
          win,
          elem = this[0],
          box = {
            top: 0,
            left: 0
          },
          doc = elem && elem.ownerDocument;
      if (!doc) {
        return;
      }
      docElem = doc.documentElement;
      if (!jQuery.contains(docElem, elem)) {
        return box;
      }
      if (typeof elem.getBoundingClientRect !== strundefined) {
        box = elem.getBoundingClientRect();
      }
      win = getWindow(doc);
      return {
        top: box.top + win.pageYOffset - docElem.clientTop,
        left: box.left + win.pageXOffset - docElem.clientLeft
      };
    },
    position: function() {
      if (!this[0]) {
        return;
      }
      var offsetParent,
          offset,
          elem = this[0],
          parentOffset = {
            top: 0,
            left: 0
          };
      if (jQuery.css(elem, "position") === "fixed") {
        offset = elem.getBoundingClientRect();
      } else {
        offsetParent = this.offsetParent();
        offset = this.offset();
        if (!jQuery.nodeName(offsetParent[0], "html")) {
          parentOffset = offsetParent.offset();
        }
        parentOffset.top += jQuery.css(offsetParent[0], "borderTopWidth", true);
        parentOffset.left += jQuery.css(offsetParent[0], "borderLeftWidth", true);
      }
      return {
        top: offset.top - parentOffset.top - jQuery.css(elem, "marginTop", true),
        left: offset.left - parentOffset.left - jQuery.css(elem, "marginLeft", true)
      };
    },
    offsetParent: function() {
      return this.map(function() {
        var offsetParent = this.offsetParent || docElem;
        while (offsetParent && (!jQuery.nodeName(offsetParent, "html") && jQuery.css(offsetParent, "position") === "static")) {
          offsetParent = offsetParent.offsetParent;
        }
        return offsetParent || docElem;
      });
    }
  });
  jQuery.each({
    scrollLeft: "pageXOffset",
    scrollTop: "pageYOffset"
  }, function(method, prop) {
    var top = "pageYOffset" === prop;
    jQuery.fn[method] = function(val) {
      return access(this, function(elem, method, val) {
        var win = getWindow(elem);
        if (val === undefined) {
          return win ? win[prop] : elem[method];
        }
        if (win) {
          win.scrollTo(!top ? val : window.pageXOffset, top ? val : window.pageYOffset);
        } else {
          elem[method] = val;
        }
      }, method, val, arguments.length, null);
    };
  });
  jQuery.each(["top", "left"], function(i, prop) {
    jQuery.cssHooks[prop] = addGetHookIf(support.pixelPosition, function(elem, computed) {
      if (computed) {
        computed = curCSS(elem, prop);
        return rnumnonpx.test(computed) ? jQuery(elem).position()[prop] + "px" : computed;
      }
    });
  });
  jQuery.each({
    Height: "height",
    Width: "width"
  }, function(name, type) {
    jQuery.each({
      padding: "inner" + name,
      content: type,
      "": "outer" + name
    }, function(defaultExtra, funcName) {
      jQuery.fn[funcName] = function(margin, value) {
        var chainable = arguments.length && (defaultExtra || typeof margin !== "boolean"),
            extra = defaultExtra || (margin === true || value === true ? "margin" : "border");
        return access(this, function(elem, type, value) {
          var doc;
          if (jQuery.isWindow(elem)) {
            return elem.document.documentElement["client" + name];
          }
          if (elem.nodeType === 9) {
            doc = elem.documentElement;
            return Math.max(elem.body["scroll" + name], doc["scroll" + name], elem.body["offset" + name], doc["offset" + name], doc["client" + name]);
          }
          return value === undefined ? jQuery.css(elem, type, extra) : jQuery.style(elem, type, value, extra);
        }, type, chainable ? margin : undefined, chainable, null);
      };
    });
  });
  jQuery.fn.size = function() {
    return this.length;
  };
  jQuery.fn.andSelf = jQuery.fn.addBack;
  if (typeof define === "function" && define.amd) {
    define("17", [], function() {
      return jQuery;
    });
  }
  var _jQuery = window.jQuery,
      _$ = window.$;
  jQuery.noConflict = function(deep) {
    if (window.$ === jQuery) {
      window.$ = _$;
    }
    if (deep && window.jQuery === jQuery) {
      window.jQuery = _jQuery;
    }
    return jQuery;
  };
  if (typeof noGlobal === strundefined) {
    window.jQuery = window.$ = jQuery;
  }
  return jQuery;
}));

_removeDefine();
})();
(function() {
var _removeDefine = $__System.get("@@amd-helpers").createDefine();
define("18", ["17"], function(main) {
  return main;
});

_removeDefine();
})();
(function() {
var _removeDefine = $__System.get("@@amd-helpers").createDefine();
(function(factory) {
  if (typeof define === "function" && define.amd) {
    define("19", ["18"], factory);
  } else {
    factory(jQuery);
  }
}(function($) {
  var dataSpace = "ui-effects-",
      jQuery = $;
  $.effects = {effect: {}};
  (function(jQuery, undefined) {
    var stepHooks = "backgroundColor borderBottomColor borderLeftColor borderRightColor borderTopColor color columnRuleColor outlineColor textDecorationColor textEmphasisColor",
        rplusequals = /^([\-+])=\s*(\d+\.?\d*)/,
        stringParsers = [{
          re: /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d?(?:\.\d+)?)\s*)?\)/,
          parse: function(execResult) {
            return [execResult[1], execResult[2], execResult[3], execResult[4]];
          }
        }, {
          re: /rgba?\(\s*(\d+(?:\.\d+)?)\%\s*,\s*(\d+(?:\.\d+)?)\%\s*,\s*(\d+(?:\.\d+)?)\%\s*(?:,\s*(\d?(?:\.\d+)?)\s*)?\)/,
          parse: function(execResult) {
            return [execResult[1] * 2.55, execResult[2] * 2.55, execResult[3] * 2.55, execResult[4]];
          }
        }, {
          re: /#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})/,
          parse: function(execResult) {
            return [parseInt(execResult[1], 16), parseInt(execResult[2], 16), parseInt(execResult[3], 16)];
          }
        }, {
          re: /#([a-f0-9])([a-f0-9])([a-f0-9])/,
          parse: function(execResult) {
            return [parseInt(execResult[1] + execResult[1], 16), parseInt(execResult[2] + execResult[2], 16), parseInt(execResult[3] + execResult[3], 16)];
          }
        }, {
          re: /hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\%\s*,\s*(\d+(?:\.\d+)?)\%\s*(?:,\s*(\d?(?:\.\d+)?)\s*)?\)/,
          space: "hsla",
          parse: function(execResult) {
            return [execResult[1], execResult[2] / 100, execResult[3] / 100, execResult[4]];
          }
        }],
        color = jQuery.Color = function(color, green, blue, alpha) {
          return new jQuery.Color.fn.parse(color, green, blue, alpha);
        },
        spaces = {
          rgba: {props: {
              red: {
                idx: 0,
                type: "byte"
              },
              green: {
                idx: 1,
                type: "byte"
              },
              blue: {
                idx: 2,
                type: "byte"
              }
            }},
          hsla: {props: {
              hue: {
                idx: 0,
                type: "degrees"
              },
              saturation: {
                idx: 1,
                type: "percent"
              },
              lightness: {
                idx: 2,
                type: "percent"
              }
            }}
        },
        propTypes = {
          "byte": {
            floor: true,
            max: 255
          },
          "percent": {max: 1},
          "degrees": {
            mod: 360,
            floor: true
          }
        },
        support = color.support = {},
        supportElem = jQuery("<p>")[0],
        colors,
        each = jQuery.each;
    supportElem.style.cssText = "background-color:rgba(1,1,1,.5)";
    support.rgba = supportElem.style.backgroundColor.indexOf("rgba") > -1;
    each(spaces, function(spaceName, space) {
      space.cache = "_" + spaceName;
      space.props.alpha = {
        idx: 3,
        type: "percent",
        def: 1
      };
    });
    function clamp(value, prop, allowEmpty) {
      var type = propTypes[prop.type] || {};
      if (value == null) {
        return (allowEmpty || !prop.def) ? null : prop.def;
      }
      value = type.floor ? ~~value : parseFloat(value);
      if (isNaN(value)) {
        return prop.def;
      }
      if (type.mod) {
        return (value + type.mod) % type.mod;
      }
      return 0 > value ? 0 : type.max < value ? type.max : value;
    }
    function stringParse(string) {
      var inst = color(),
          rgba = inst._rgba = [];
      string = string.toLowerCase();
      each(stringParsers, function(i, parser) {
        var parsed,
            match = parser.re.exec(string),
            values = match && parser.parse(match),
            spaceName = parser.space || "rgba";
        if (values) {
          parsed = inst[spaceName](values);
          inst[spaces[spaceName].cache] = parsed[spaces[spaceName].cache];
          rgba = inst._rgba = parsed._rgba;
          return false;
        }
      });
      if (rgba.length) {
        if (rgba.join() === "0,0,0,0") {
          jQuery.extend(rgba, colors.transparent);
        }
        return inst;
      }
      return colors[string];
    }
    color.fn = jQuery.extend(color.prototype, {
      parse: function(red, green, blue, alpha) {
        if (red === undefined) {
          this._rgba = [null, null, null, null];
          return this;
        }
        if (red.jquery || red.nodeType) {
          red = jQuery(red).css(green);
          green = undefined;
        }
        var inst = this,
            type = jQuery.type(red),
            rgba = this._rgba = [];
        if (green !== undefined) {
          red = [red, green, blue, alpha];
          type = "array";
        }
        if (type === "string") {
          return this.parse(stringParse(red) || colors._default);
        }
        if (type === "array") {
          each(spaces.rgba.props, function(key, prop) {
            rgba[prop.idx] = clamp(red[prop.idx], prop);
          });
          return this;
        }
        if (type === "object") {
          if (red instanceof color) {
            each(spaces, function(spaceName, space) {
              if (red[space.cache]) {
                inst[space.cache] = red[space.cache].slice();
              }
            });
          } else {
            each(spaces, function(spaceName, space) {
              var cache = space.cache;
              each(space.props, function(key, prop) {
                if (!inst[cache] && space.to) {
                  if (key === "alpha" || red[key] == null) {
                    return;
                  }
                  inst[cache] = space.to(inst._rgba);
                }
                inst[cache][prop.idx] = clamp(red[key], prop, true);
              });
              if (inst[cache] && jQuery.inArray(null, inst[cache].slice(0, 3)) < 0) {
                inst[cache][3] = 1;
                if (space.from) {
                  inst._rgba = space.from(inst[cache]);
                }
              }
            });
          }
          return this;
        }
      },
      is: function(compare) {
        var is = color(compare),
            same = true,
            inst = this;
        each(spaces, function(_, space) {
          var localCache,
              isCache = is[space.cache];
          if (isCache) {
            localCache = inst[space.cache] || space.to && space.to(inst._rgba) || [];
            each(space.props, function(_, prop) {
              if (isCache[prop.idx] != null) {
                same = (isCache[prop.idx] === localCache[prop.idx]);
                return same;
              }
            });
          }
          return same;
        });
        return same;
      },
      _space: function() {
        var used = [],
            inst = this;
        each(spaces, function(spaceName, space) {
          if (inst[space.cache]) {
            used.push(spaceName);
          }
        });
        return used.pop();
      },
      transition: function(other, distance) {
        var end = color(other),
            spaceName = end._space(),
            space = spaces[spaceName],
            startColor = this.alpha() === 0 ? color("transparent") : this,
            start = startColor[space.cache] || space.to(startColor._rgba),
            result = start.slice();
        end = end[space.cache];
        each(space.props, function(key, prop) {
          var index = prop.idx,
              startValue = start[index],
              endValue = end[index],
              type = propTypes[prop.type] || {};
          if (endValue === null) {
            return;
          }
          if (startValue === null) {
            result[index] = endValue;
          } else {
            if (type.mod) {
              if (endValue - startValue > type.mod / 2) {
                startValue += type.mod;
              } else if (startValue - endValue > type.mod / 2) {
                startValue -= type.mod;
              }
            }
            result[index] = clamp((endValue - startValue) * distance + startValue, prop);
          }
        });
        return this[spaceName](result);
      },
      blend: function(opaque) {
        if (this._rgba[3] === 1) {
          return this;
        }
        var rgb = this._rgba.slice(),
            a = rgb.pop(),
            blend = color(opaque)._rgba;
        return color(jQuery.map(rgb, function(v, i) {
          return (1 - a) * blend[i] + a * v;
        }));
      },
      toRgbaString: function() {
        var prefix = "rgba(",
            rgba = jQuery.map(this._rgba, function(v, i) {
              return v == null ? (i > 2 ? 1 : 0) : v;
            });
        if (rgba[3] === 1) {
          rgba.pop();
          prefix = "rgb(";
        }
        return prefix + rgba.join() + ")";
      },
      toHslaString: function() {
        var prefix = "hsla(",
            hsla = jQuery.map(this.hsla(), function(v, i) {
              if (v == null) {
                v = i > 2 ? 1 : 0;
              }
              if (i && i < 3) {
                v = Math.round(v * 100) + "%";
              }
              return v;
            });
        if (hsla[3] === 1) {
          hsla.pop();
          prefix = "hsl(";
        }
        return prefix + hsla.join() + ")";
      },
      toHexString: function(includeAlpha) {
        var rgba = this._rgba.slice(),
            alpha = rgba.pop();
        if (includeAlpha) {
          rgba.push(~~(alpha * 255));
        }
        return "#" + jQuery.map(rgba, function(v) {
          v = (v || 0).toString(16);
          return v.length === 1 ? "0" + v : v;
        }).join("");
      },
      toString: function() {
        return this._rgba[3] === 0 ? "transparent" : this.toRgbaString();
      }
    });
    color.fn.parse.prototype = color.fn;
    function hue2rgb(p, q, h) {
      h = (h + 1) % 1;
      if (h * 6 < 1) {
        return p + (q - p) * h * 6;
      }
      if (h * 2 < 1) {
        return q;
      }
      if (h * 3 < 2) {
        return p + (q - p) * ((2 / 3) - h) * 6;
      }
      return p;
    }
    spaces.hsla.to = function(rgba) {
      if (rgba[0] == null || rgba[1] == null || rgba[2] == null) {
        return [null, null, null, rgba[3]];
      }
      var r = rgba[0] / 255,
          g = rgba[1] / 255,
          b = rgba[2] / 255,
          a = rgba[3],
          max = Math.max(r, g, b),
          min = Math.min(r, g, b),
          diff = max - min,
          add = max + min,
          l = add * 0.5,
          h,
          s;
      if (min === max) {
        h = 0;
      } else if (r === max) {
        h = (60 * (g - b) / diff) + 360;
      } else if (g === max) {
        h = (60 * (b - r) / diff) + 120;
      } else {
        h = (60 * (r - g) / diff) + 240;
      }
      if (diff === 0) {
        s = 0;
      } else if (l <= 0.5) {
        s = diff / add;
      } else {
        s = diff / (2 - add);
      }
      return [Math.round(h) % 360, s, l, a == null ? 1 : a];
    };
    spaces.hsla.from = function(hsla) {
      if (hsla[0] == null || hsla[1] == null || hsla[2] == null) {
        return [null, null, null, hsla[3]];
      }
      var h = hsla[0] / 360,
          s = hsla[1],
          l = hsla[2],
          a = hsla[3],
          q = l <= 0.5 ? l * (1 + s) : l + s - l * s,
          p = 2 * l - q;
      return [Math.round(hue2rgb(p, q, h + (1 / 3)) * 255), Math.round(hue2rgb(p, q, h) * 255), Math.round(hue2rgb(p, q, h - (1 / 3)) * 255), a];
    };
    each(spaces, function(spaceName, space) {
      var props = space.props,
          cache = space.cache,
          to = space.to,
          from = space.from;
      color.fn[spaceName] = function(value) {
        if (to && !this[cache]) {
          this[cache] = to(this._rgba);
        }
        if (value === undefined) {
          return this[cache].slice();
        }
        var ret,
            type = jQuery.type(value),
            arr = (type === "array" || type === "object") ? value : arguments,
            local = this[cache].slice();
        each(props, function(key, prop) {
          var val = arr[type === "object" ? key : prop.idx];
          if (val == null) {
            val = local[prop.idx];
          }
          local[prop.idx] = clamp(val, prop);
        });
        if (from) {
          ret = color(from(local));
          ret[cache] = local;
          return ret;
        } else {
          return color(local);
        }
      };
      each(props, function(key, prop) {
        if (color.fn[key]) {
          return;
        }
        color.fn[key] = function(value) {
          var vtype = jQuery.type(value),
              fn = (key === "alpha" ? (this._hsla ? "hsla" : "rgba") : spaceName),
              local = this[fn](),
              cur = local[prop.idx],
              match;
          if (vtype === "undefined") {
            return cur;
          }
          if (vtype === "function") {
            value = value.call(this, cur);
            vtype = jQuery.type(value);
          }
          if (value == null && prop.empty) {
            return this;
          }
          if (vtype === "string") {
            match = rplusequals.exec(value);
            if (match) {
              value = cur + parseFloat(match[2]) * (match[1] === "+" ? 1 : -1);
            }
          }
          local[prop.idx] = value;
          return this[fn](local);
        };
      });
    });
    color.hook = function(hook) {
      var hooks = hook.split(" ");
      each(hooks, function(i, hook) {
        jQuery.cssHooks[hook] = {set: function(elem, value) {
            var parsed,
                curElem,
                backgroundColor = "";
            if (value !== "transparent" && (jQuery.type(value) !== "string" || (parsed = stringParse(value)))) {
              value = color(parsed || value);
              if (!support.rgba && value._rgba[3] !== 1) {
                curElem = hook === "backgroundColor" ? elem.parentNode : elem;
                while ((backgroundColor === "" || backgroundColor === "transparent") && curElem && curElem.style) {
                  try {
                    backgroundColor = jQuery.css(curElem, "backgroundColor");
                    curElem = curElem.parentNode;
                  } catch (e) {}
                }
                value = value.blend(backgroundColor && backgroundColor !== "transparent" ? backgroundColor : "_default");
              }
              value = value.toRgbaString();
            }
            try {
              elem.style[hook] = value;
            } catch (e) {}
          }};
        jQuery.fx.step[hook] = function(fx) {
          if (!fx.colorInit) {
            fx.start = color(fx.elem, hook);
            fx.end = color(fx.end);
            fx.colorInit = true;
          }
          jQuery.cssHooks[hook].set(fx.elem, fx.start.transition(fx.end, fx.pos));
        };
      });
    };
    color.hook(stepHooks);
    jQuery.cssHooks.borderColor = {expand: function(value) {
        var expanded = {};
        each(["Top", "Right", "Bottom", "Left"], function(i, part) {
          expanded["border" + part + "Color"] = value;
        });
        return expanded;
      }};
    colors = jQuery.Color.names = {
      aqua: "#00ffff",
      black: "#000000",
      blue: "#0000ff",
      fuchsia: "#ff00ff",
      gray: "#808080",
      green: "#008000",
      lime: "#00ff00",
      maroon: "#800000",
      navy: "#000080",
      olive: "#808000",
      purple: "#800080",
      red: "#ff0000",
      silver: "#c0c0c0",
      teal: "#008080",
      white: "#ffffff",
      yellow: "#ffff00",
      transparent: [null, null, null, 0],
      _default: "#ffffff"
    };
  })(jQuery);
  (function() {
    var classAnimationActions = ["add", "remove", "toggle"],
        shorthandStyles = {
          border: 1,
          borderBottom: 1,
          borderColor: 1,
          borderLeft: 1,
          borderRight: 1,
          borderTop: 1,
          borderWidth: 1,
          margin: 1,
          padding: 1
        };
    $.each(["borderLeftStyle", "borderRightStyle", "borderBottomStyle", "borderTopStyle"], function(_, prop) {
      $.fx.step[prop] = function(fx) {
        if (fx.end !== "none" && !fx.setAttr || fx.pos === 1 && !fx.setAttr) {
          jQuery.style(fx.elem, prop, fx.end);
          fx.setAttr = true;
        }
      };
    });
    function getElementStyles(elem) {
      var key,
          len,
          style = elem.ownerDocument.defaultView ? elem.ownerDocument.defaultView.getComputedStyle(elem, null) : elem.currentStyle,
          styles = {};
      if (style && style.length && style[0] && style[style[0]]) {
        len = style.length;
        while (len--) {
          key = style[len];
          if (typeof style[key] === "string") {
            styles[$.camelCase(key)] = style[key];
          }
        }
      } else {
        for (key in style) {
          if (typeof style[key] === "string") {
            styles[key] = style[key];
          }
        }
      }
      return styles;
    }
    function styleDifference(oldStyle, newStyle) {
      var diff = {},
          name,
          value;
      for (name in newStyle) {
        value = newStyle[name];
        if (oldStyle[name] !== value) {
          if (!shorthandStyles[name]) {
            if ($.fx.step[name] || !isNaN(parseFloat(value))) {
              diff[name] = value;
            }
          }
        }
      }
      return diff;
    }
    if (!$.fn.addBack) {
      $.fn.addBack = function(selector) {
        return this.add(selector == null ? this.prevObject : this.prevObject.filter(selector));
      };
    }
    $.effects.animateClass = function(value, duration, easing, callback) {
      var o = $.speed(duration, easing, callback);
      return this.queue(function() {
        var animated = $(this),
            baseClass = animated.attr("class") || "",
            applyClassChange,
            allAnimations = o.children ? animated.find("*").addBack() : animated;
        allAnimations = allAnimations.map(function() {
          var el = $(this);
          return {
            el: el,
            start: getElementStyles(this)
          };
        });
        applyClassChange = function() {
          $.each(classAnimationActions, function(i, action) {
            if (value[action]) {
              animated[action + "Class"](value[action]);
            }
          });
        };
        applyClassChange();
        allAnimations = allAnimations.map(function() {
          this.end = getElementStyles(this.el[0]);
          this.diff = styleDifference(this.start, this.end);
          return this;
        });
        animated.attr("class", baseClass);
        allAnimations = allAnimations.map(function() {
          var styleInfo = this,
              dfd = $.Deferred(),
              opts = $.extend({}, o, {
                queue: false,
                complete: function() {
                  dfd.resolve(styleInfo);
                }
              });
          this.el.animate(this.diff, opts);
          return dfd.promise();
        });
        $.when.apply($, allAnimations.get()).done(function() {
          applyClassChange();
          $.each(arguments, function() {
            var el = this.el;
            $.each(this.diff, function(key) {
              el.css(key, "");
            });
          });
          o.complete.call(animated[0]);
        });
      });
    };
    $.fn.extend({
      addClass: (function(orig) {
        return function(classNames, speed, easing, callback) {
          return speed ? $.effects.animateClass.call(this, {add: classNames}, speed, easing, callback) : orig.apply(this, arguments);
        };
      })($.fn.addClass),
      removeClass: (function(orig) {
        return function(classNames, speed, easing, callback) {
          return arguments.length > 1 ? $.effects.animateClass.call(this, {remove: classNames}, speed, easing, callback) : orig.apply(this, arguments);
        };
      })($.fn.removeClass),
      toggleClass: (function(orig) {
        return function(classNames, force, speed, easing, callback) {
          if (typeof force === "boolean" || force === undefined) {
            if (!speed) {
              return orig.apply(this, arguments);
            } else {
              return $.effects.animateClass.call(this, (force ? {add: classNames} : {remove: classNames}), speed, easing, callback);
            }
          } else {
            return $.effects.animateClass.call(this, {toggle: classNames}, force, speed, easing);
          }
        };
      })($.fn.toggleClass),
      switchClass: function(remove, add, speed, easing, callback) {
        return $.effects.animateClass.call(this, {
          add: add,
          remove: remove
        }, speed, easing, callback);
      }
    });
  })();
  (function() {
    $.extend($.effects, {
      version: "1.11.4",
      save: function(element, set) {
        for (var i = 0; i < set.length; i++) {
          if (set[i] !== null) {
            element.data(dataSpace + set[i], element[0].style[set[i]]);
          }
        }
      },
      restore: function(element, set) {
        var val,
            i;
        for (i = 0; i < set.length; i++) {
          if (set[i] !== null) {
            val = element.data(dataSpace + set[i]);
            if (val === undefined) {
              val = "";
            }
            element.css(set[i], val);
          }
        }
      },
      setMode: function(el, mode) {
        if (mode === "toggle") {
          mode = el.is(":hidden") ? "show" : "hide";
        }
        return mode;
      },
      getBaseline: function(origin, original) {
        var y,
            x;
        switch (origin[0]) {
          case "top":
            y = 0;
            break;
          case "middle":
            y = 0.5;
            break;
          case "bottom":
            y = 1;
            break;
          default:
            y = origin[0] / original.height;
        }
        switch (origin[1]) {
          case "left":
            x = 0;
            break;
          case "center":
            x = 0.5;
            break;
          case "right":
            x = 1;
            break;
          default:
            x = origin[1] / original.width;
        }
        return {
          x: x,
          y: y
        };
      },
      createWrapper: function(element) {
        if (element.parent().is(".ui-effects-wrapper")) {
          return element.parent();
        }
        var props = {
          width: element.outerWidth(true),
          height: element.outerHeight(true),
          "float": element.css("float")
        },
            wrapper = $("<div></div>").addClass("ui-effects-wrapper").css({
              fontSize: "100%",
              background: "transparent",
              border: "none",
              margin: 0,
              padding: 0
            }),
            size = {
              width: element.width(),
              height: element.height()
            },
            active = document.activeElement;
        try {
          active.id;
        } catch (e) {
          active = document.body;
        }
        element.wrap(wrapper);
        if (element[0] === active || $.contains(element[0], active)) {
          $(active).focus();
        }
        wrapper = element.parent();
        if (element.css("position") === "static") {
          wrapper.css({position: "relative"});
          element.css({position: "relative"});
        } else {
          $.extend(props, {
            position: element.css("position"),
            zIndex: element.css("z-index")
          });
          $.each(["top", "left", "bottom", "right"], function(i, pos) {
            props[pos] = element.css(pos);
            if (isNaN(parseInt(props[pos], 10))) {
              props[pos] = "auto";
            }
          });
          element.css({
            position: "relative",
            top: 0,
            left: 0,
            right: "auto",
            bottom: "auto"
          });
        }
        element.css(size);
        return wrapper.css(props).show();
      },
      removeWrapper: function(element) {
        var active = document.activeElement;
        if (element.parent().is(".ui-effects-wrapper")) {
          element.parent().replaceWith(element);
          if (element[0] === active || $.contains(element[0], active)) {
            $(active).focus();
          }
        }
        return element;
      },
      setTransition: function(element, list, factor, value) {
        value = value || {};
        $.each(list, function(i, x) {
          var unit = element.cssUnit(x);
          if (unit[0] > 0) {
            value[x] = unit[0] * factor + unit[1];
          }
        });
        return value;
      }
    });
    function _normalizeArguments(effect, options, speed, callback) {
      if ($.isPlainObject(effect)) {
        options = effect;
        effect = effect.effect;
      }
      effect = {effect: effect};
      if (options == null) {
        options = {};
      }
      if ($.isFunction(options)) {
        callback = options;
        speed = null;
        options = {};
      }
      if (typeof options === "number" || $.fx.speeds[options]) {
        callback = speed;
        speed = options;
        options = {};
      }
      if ($.isFunction(speed)) {
        callback = speed;
        speed = null;
      }
      if (options) {
        $.extend(effect, options);
      }
      speed = speed || options.duration;
      effect.duration = $.fx.off ? 0 : typeof speed === "number" ? speed : speed in $.fx.speeds ? $.fx.speeds[speed] : $.fx.speeds._default;
      effect.complete = callback || options.complete;
      return effect;
    }
    function standardAnimationOption(option) {
      if (!option || typeof option === "number" || $.fx.speeds[option]) {
        return true;
      }
      if (typeof option === "string" && !$.effects.effect[option]) {
        return true;
      }
      if ($.isFunction(option)) {
        return true;
      }
      if (typeof option === "object" && !option.effect) {
        return true;
      }
      return false;
    }
    $.fn.extend({
      effect: function() {
        var args = _normalizeArguments.apply(this, arguments),
            mode = args.mode,
            queue = args.queue,
            effectMethod = $.effects.effect[args.effect];
        if ($.fx.off || !effectMethod) {
          if (mode) {
            return this[mode](args.duration, args.complete);
          } else {
            return this.each(function() {
              if (args.complete) {
                args.complete.call(this);
              }
            });
          }
        }
        function run(next) {
          var elem = $(this),
              complete = args.complete,
              mode = args.mode;
          function done() {
            if ($.isFunction(complete)) {
              complete.call(elem[0]);
            }
            if ($.isFunction(next)) {
              next();
            }
          }
          if (elem.is(":hidden") ? mode === "hide" : mode === "show") {
            elem[mode]();
            done();
          } else {
            effectMethod.call(elem[0], args, done);
          }
        }
        return queue === false ? this.each(run) : this.queue(queue || "fx", run);
      },
      show: (function(orig) {
        return function(option) {
          if (standardAnimationOption(option)) {
            return orig.apply(this, arguments);
          } else {
            var args = _normalizeArguments.apply(this, arguments);
            args.mode = "show";
            return this.effect.call(this, args);
          }
        };
      })($.fn.show),
      hide: (function(orig) {
        return function(option) {
          if (standardAnimationOption(option)) {
            return orig.apply(this, arguments);
          } else {
            var args = _normalizeArguments.apply(this, arguments);
            args.mode = "hide";
            return this.effect.call(this, args);
          }
        };
      })($.fn.hide),
      toggle: (function(orig) {
        return function(option) {
          if (standardAnimationOption(option) || typeof option === "boolean") {
            return orig.apply(this, arguments);
          } else {
            var args = _normalizeArguments.apply(this, arguments);
            args.mode = "toggle";
            return this.effect.call(this, args);
          }
        };
      })($.fn.toggle),
      cssUnit: function(key) {
        var style = this.css(key),
            val = [];
        $.each(["em", "px", "%", "pt"], function(i, unit) {
          if (style.indexOf(unit) > 0) {
            val = [parseFloat(style), unit];
          }
        });
        return val;
      }
    });
  })();
  (function() {
    var baseEasings = {};
    $.each(["Quad", "Cubic", "Quart", "Quint", "Expo"], function(i, name) {
      baseEasings[name] = function(p) {
        return Math.pow(p, i + 2);
      };
    });
    $.extend(baseEasings, {
      Sine: function(p) {
        return 1 - Math.cos(p * Math.PI / 2);
      },
      Circ: function(p) {
        return 1 - Math.sqrt(1 - p * p);
      },
      Elastic: function(p) {
        return p === 0 || p === 1 ? p : -Math.pow(2, 8 * (p - 1)) * Math.sin(((p - 1) * 80 - 7.5) * Math.PI / 15);
      },
      Back: function(p) {
        return p * p * (3 * p - 2);
      },
      Bounce: function(p) {
        var pow2,
            bounce = 4;
        while (p < ((pow2 = Math.pow(2, --bounce)) - 1) / 11) {}
        return 1 / Math.pow(4, 3 - bounce) - 7.5625 * Math.pow((pow2 * 3 - 2) / 22 - p, 2);
      }
    });
    $.each(baseEasings, function(name, easeIn) {
      $.easing["easeIn" + name] = easeIn;
      $.easing["easeOut" + name] = function(p) {
        return 1 - easeIn(1 - p);
      };
      $.easing["easeInOut" + name] = function(p) {
        return p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn(p * -2 + 2) / 2;
      };
    });
  })();
  return $.effects;
}));

_removeDefine();
})();
$__System.registerDynamic("1a", [], false, function(__require, __exports, __module) {
  var _retrieveGlobal = $__System.get("@@global-helpers").prepareGlobal(__module.id, null, null);
  (function() {
    (function($) {
      $.fn.extend({slimScroll: function(options) {
          var defaults = {
            width: 'auto',
            height: '250px',
            size: '7px',
            color: '#000',
            position: 'right',
            distance: '1px',
            start: 'top',
            opacity: .4,
            alwaysVisible: false,
            disableFadeOut: false,
            railVisible: false,
            railColor: '#333',
            railOpacity: .2,
            railDraggable: true,
            railClass: 'slimScrollRail',
            barClass: 'slimScrollBar',
            wrapperClass: 'slimScrollDiv',
            allowPageScroll: false,
            wheelStep: 20,
            touchScrollStep: 200,
            borderRadius: '7px',
            railBorderRadius: '7px'
          };
          var o = $.extend(defaults, options);
          this.each(function() {
            var isOverPanel,
                isOverBar,
                isDragg,
                queueHide,
                touchDif,
                barHeight,
                percentScroll,
                lastScroll,
                divS = '<div></div>',
                minBarHeight = 30,
                releaseScroll = false;
            var me = $(this);
            if (me.parent().hasClass(o.wrapperClass)) {
              var offset = me.scrollTop();
              bar = me.closest('.' + o.barClass);
              rail = me.closest('.' + o.railClass);
              getBarHeight();
              if ($.isPlainObject(options)) {
                if ('height' in options && options.height == 'auto') {
                  me.parent().css('height', 'auto');
                  me.css('height', 'auto');
                  var height = me.parent().parent().height();
                  me.parent().css('height', height);
                  me.css('height', height);
                }
                if ('scrollTo' in options) {
                  offset = parseInt(o.scrollTo);
                } else if ('scrollBy' in options) {
                  offset += parseInt(o.scrollBy);
                } else if ('destroy' in options) {
                  bar.remove();
                  rail.remove();
                  me.unwrap();
                  return;
                }
                scrollContent(offset, false, true);
              }
              return;
            } else if ($.isPlainObject(options)) {
              if ('destroy' in options) {
                return;
              }
            }
            o.height = (o.height == 'auto') ? me.parent().height() : o.height;
            var wrapper = $(divS).addClass(o.wrapperClass).css({
              position: 'relative',
              overflow: 'hidden',
              width: o.width,
              height: o.height
            });
            me.css({
              overflow: 'hidden',
              width: o.width,
              height: o.height
            });
            var rail = $(divS).addClass(o.railClass).css({
              width: o.size,
              height: '100%',
              position: 'absolute',
              top: 0,
              display: (o.alwaysVisible && o.railVisible) ? 'block' : 'none',
              'border-radius': o.railBorderRadius,
              background: o.railColor,
              opacity: o.railOpacity,
              zIndex: 90
            });
            var bar = $(divS).addClass(o.barClass).css({
              background: o.color,
              width: o.size,
              position: 'absolute',
              top: 0,
              opacity: o.opacity,
              display: o.alwaysVisible ? 'block' : 'none',
              'border-radius': o.borderRadius,
              BorderRadius: o.borderRadius,
              MozBorderRadius: o.borderRadius,
              WebkitBorderRadius: o.borderRadius,
              zIndex: 99
            });
            var posCss = (o.position == 'right') ? {right: o.distance} : {left: o.distance};
            rail.css(posCss);
            bar.css(posCss);
            me.wrap(wrapper);
            me.parent().append(bar);
            me.parent().append(rail);
            if (o.railDraggable) {
              bar.bind("mousedown", function(e) {
                var $doc = $(document);
                isDragg = true;
                t = parseFloat(bar.css('top'));
                pageY = e.pageY;
                $doc.bind("mousemove.slimscroll", function(e) {
                  currTop = t + e.pageY - pageY;
                  bar.css('top', currTop);
                  scrollContent(0, bar.position().top, false);
                });
                $doc.bind("mouseup.slimscroll", function(e) {
                  isDragg = false;
                  hideBar();
                  $doc.unbind('.slimscroll');
                });
                return false;
              }).bind("selectstart.slimscroll", function(e) {
                e.stopPropagation();
                e.preventDefault();
                return false;
              });
            }
            rail.hover(function() {
              showBar();
            }, function() {
              hideBar();
            });
            bar.hover(function() {
              isOverBar = true;
            }, function() {
              isOverBar = false;
            });
            me.hover(function() {
              isOverPanel = true;
              showBar();
              hideBar();
            }, function() {
              isOverPanel = false;
              hideBar();
            });
            me.bind('touchstart', function(e, b) {
              if (e.originalEvent.touches.length) {
                touchDif = e.originalEvent.touches[0].pageY;
              }
            });
            me.bind('touchmove', function(e) {
              if (!releaseScroll) {
                e.originalEvent.preventDefault();
              }
              if (e.originalEvent.touches.length) {
                var diff = (touchDif - e.originalEvent.touches[0].pageY) / o.touchScrollStep;
                scrollContent(diff, true);
                touchDif = e.originalEvent.touches[0].pageY;
              }
            });
            getBarHeight();
            if (o.start === 'bottom') {
              bar.css({top: me.outerHeight() - bar.outerHeight()});
              scrollContent(0, true);
            } else if (o.start !== 'top') {
              scrollContent($(o.start).position().top, null, true);
              if (!o.alwaysVisible) {
                bar.hide();
              }
            }
            attachWheel(this);
            function _onWheel(e) {
              if (!isOverPanel) {
                return;
              }
              var e = e || window.event;
              var delta = 0;
              if (e.wheelDelta) {
                delta = -e.wheelDelta / 120;
              }
              if (e.detail) {
                delta = e.detail / 3;
              }
              var target = e.target || e.srcTarget || e.srcElement;
              if ($(target).closest('.' + o.wrapperClass).is(me.parent())) {
                scrollContent(delta, true);
              }
              if (e.preventDefault && !releaseScroll) {
                e.preventDefault();
              }
              if (!releaseScroll) {
                e.returnValue = false;
              }
            }
            function scrollContent(y, isWheel, isJump) {
              releaseScroll = false;
              var delta = y;
              var maxTop = me.outerHeight() - bar.outerHeight();
              if (isWheel) {
                delta = parseInt(bar.css('top')) + y * parseInt(o.wheelStep) / 100 * bar.outerHeight();
                delta = Math.min(Math.max(delta, 0), maxTop);
                delta = (y > 0) ? Math.ceil(delta) : Math.floor(delta);
                bar.css({top: delta + 'px'});
              }
              percentScroll = parseInt(bar.css('top')) / (me.outerHeight() - bar.outerHeight());
              delta = percentScroll * (me[0].scrollHeight - me.outerHeight());
              if (isJump) {
                delta = y;
                var offsetTop = delta / me[0].scrollHeight * me.outerHeight();
                offsetTop = Math.min(Math.max(offsetTop, 0), maxTop);
                bar.css({top: offsetTop + 'px'});
              }
              me.scrollTop(delta);
              me.trigger('slimscrolling', ~~delta);
              showBar();
              hideBar();
            }
            function attachWheel(target) {
              if (window.addEventListener) {
                target.addEventListener('DOMMouseScroll', _onWheel, false);
                target.addEventListener('mousewheel', _onWheel, false);
              } else {
                document.attachEvent("onmousewheel", _onWheel);
              }
            }
            function getBarHeight() {
              barHeight = Math.max((me.outerHeight() / me[0].scrollHeight) * me.outerHeight(), minBarHeight);
              bar.css({height: barHeight + 'px'});
              var display = barHeight == me.outerHeight() ? 'none' : 'block';
              bar.css({display: display});
            }
            function showBar() {
              getBarHeight();
              clearTimeout(queueHide);
              if (percentScroll == ~~percentScroll) {
                releaseScroll = o.allowPageScroll;
                if (lastScroll != percentScroll) {
                  var msg = (~~percentScroll == 0) ? 'top' : 'bottom';
                  me.trigger('slimscroll', msg);
                }
              } else {
                releaseScroll = false;
              }
              lastScroll = percentScroll;
              if (barHeight >= me.outerHeight()) {
                releaseScroll = true;
                return;
              }
              bar.stop(true, true).fadeIn('fast');
              if (o.railVisible) {
                rail.stop(true, true).fadeIn('fast');
              }
            }
            function hideBar() {
              if (!o.alwaysVisible) {
                queueHide = setTimeout(function() {
                  if (!(o.disableFadeOut && isOverPanel) && !isOverBar && !isDragg) {
                    bar.fadeOut('slow');
                    rail.fadeOut('slow');
                  }
                }, 1000);
              }
            }
          });
          return this;
        }});
      $.fn.extend({slimscroll: $.fn.slimScroll});
    })(jQuery);
  })();
  return _retrieveGlobal();
});

(function() {
var _removeDefine = $__System.get("@@amd-helpers").createDefine();
(function(global, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define("1b", ["18"], function($) {
      return factory($, global, global.document, global.Math);
    });
  } else if (typeof exports !== 'undefined') {
    module.exports = factory(require('jquery'), global, global.document, global.Math);
  } else {
    factory(jQuery, global, global.document, global.Math);
  }
})(typeof window !== 'undefined' ? window : this, function($, window, document, Math, undefined) {
  'use strict';
  var WRAPPER = 'fullpage-wrapper';
  var WRAPPER_SEL = '.' + WRAPPER;
  var SCROLLABLE = 'fp-scrollable';
  var SCROLLABLE_SEL = '.' + SCROLLABLE;
  var SLIMSCROLL_BAR_SEL = '.slimScrollBar';
  var SLIMSCROLL_RAIL_SEL = '.slimScrollRail';
  var RESPONSIVE = 'fp-responsive';
  var NO_TRANSITION = 'fp-notransition';
  var DESTROYED = 'fp-destroyed';
  var ENABLED = 'fp-enabled';
  var VIEWING_PREFIX = 'fp-viewing';
  var ACTIVE = 'active';
  var ACTIVE_SEL = '.' + ACTIVE;
  var SECTION_DEFAULT_SEL = '.section';
  var SECTION = 'fp-section';
  var SECTION_SEL = '.' + SECTION;
  var SECTION_ACTIVE_SEL = SECTION_SEL + ACTIVE_SEL;
  var SECTION_FIRST_SEL = SECTION_SEL + ':first';
  var SECTION_LAST_SEL = SECTION_SEL + ':last';
  var TABLE_CELL = 'fp-tableCell';
  var TABLE_CELL_SEL = '.' + TABLE_CELL;
  var AUTO_HEIGHT = 'fp-auto-height';
  var AUTO_HEIGHT_SEL = '.fp-auto-height';
  var SECTION_NAV = 'fp-nav';
  var SECTION_NAV_SEL = '#' + SECTION_NAV;
  var SECTION_NAV_TOOLTIP = 'fp-tooltip';
  var SHOW_ACTIVE_TOOLTIP = 'fp-show-active';
  var SLIDE_DEFAULT_SEL = '.slide';
  var SLIDE = 'fp-slide';
  var SLIDE_SEL = '.' + SLIDE;
  var SLIDE_ACTIVE_SEL = SLIDE_SEL + ACTIVE_SEL;
  var SLIDES_WRAPPER = 'fp-slides';
  var SLIDES_WRAPPER_SEL = '.' + SLIDES_WRAPPER;
  var SLIDES_CONTAINER = 'fp-slidesContainer';
  var SLIDES_CONTAINER_SEL = '.' + SLIDES_CONTAINER;
  var TABLE = 'fp-table';
  var SLIDES_NAV = 'fp-slidesNav';
  var SLIDES_NAV_SEL = '.' + SLIDES_NAV;
  var SLIDES_NAV_LINK_SEL = SLIDES_NAV_SEL + ' a';
  var SLIDES_ARROW = 'fp-controlArrow';
  var SLIDES_ARROW_SEL = '.' + SLIDES_ARROW;
  var SLIDES_PREV = 'fp-prev';
  var SLIDES_PREV_SEL = '.' + SLIDES_PREV;
  var SLIDES_ARROW_PREV = SLIDES_ARROW + ' ' + SLIDES_PREV;
  var SLIDES_ARROW_PREV_SEL = SLIDES_ARROW_SEL + SLIDES_PREV_SEL;
  var SLIDES_NEXT = 'fp-next';
  var SLIDES_NEXT_SEL = '.' + SLIDES_NEXT;
  var SLIDES_ARROW_NEXT = SLIDES_ARROW + ' ' + SLIDES_NEXT;
  var SLIDES_ARROW_NEXT_SEL = SLIDES_ARROW_SEL + SLIDES_NEXT_SEL;
  var $window = $(window);
  var $document = $(document);
  $.fn.fullpage = function(options) {
    var $htmlBody = $('html, body');
    var $body = $('body');
    var FP = $.fn.fullpage;
    options = $.extend({
      menu: false,
      anchors: [],
      lockAnchors: false,
      navigation: false,
      navigationPosition: 'right',
      navigationTooltips: [],
      showActiveTooltip: false,
      slidesNavigation: false,
      slidesNavPosition: 'bottom',
      scrollBar: false,
      css3: true,
      scrollingSpeed: 700,
      autoScrolling: true,
      fitToSection: true,
      fitToSectionDelay: 1000,
      easing: 'easeInOutCubic',
      easingcss3: 'ease',
      loopBottom: false,
      loopTop: false,
      loopHorizontal: true,
      continuousVertical: false,
      normalScrollElements: null,
      scrollOverflow: false,
      touchSensitivity: 5,
      normalScrollElementTouchThreshold: 5,
      keyboardScrolling: true,
      animateAnchor: true,
      recordHistory: true,
      controlArrows: true,
      controlArrowColor: '#fff',
      verticalCentered: true,
      resize: false,
      sectionsColor: [],
      paddingTop: 0,
      paddingBottom: 0,
      fixedElements: null,
      responsive: 0,
      responsiveWidth: 0,
      responsiveHeight: 0,
      sectionSelector: SECTION_DEFAULT_SEL,
      slideSelector: SLIDE_DEFAULT_SEL,
      afterLoad: null,
      onLeave: null,
      afterRender: null,
      afterResize: null,
      afterReBuild: null,
      afterSlideLoad: null,
      onSlideLeave: null
    }, options);
    displayWarnings();
    $.extend($.easing, {easeInOutCubic: function(x, t, b, c, d) {
        if ((t /= d / 2) < 1)
          return c / 2 * t * t * t + b;
        return c / 2 * ((t -= 2) * t * t + 2) + b;
      }});
    $.extend($.easing, {easeInQuart: function(x, t, b, c, d) {
        return c * (t /= d) * t * t * t + b;
      }});
    FP.setAutoScrolling = function(value, type) {
      setVariableState('autoScrolling', value, type);
      var element = $(SECTION_ACTIVE_SEL);
      if (options.autoScrolling && !options.scrollBar) {
        $htmlBody.css({
          'overflow': 'hidden',
          'height': '100%'
        });
        FP.setRecordHistory(originals.recordHistory, 'internal');
        container.css({
          '-ms-touch-action': 'none',
          'touch-action': 'none'
        });
        if (element.length) {
          silentScroll(element.position().top);
        }
      } else {
        $htmlBody.css({
          'overflow': 'visible',
          'height': 'initial'
        });
        FP.setRecordHistory(false, 'internal');
        container.css({
          '-ms-touch-action': '',
          'touch-action': ''
        });
        silentScroll(0);
        if (element.length) {
          $htmlBody.scrollTop(element.position().top);
        }
      }
    };
    FP.setRecordHistory = function(value, type) {
      setVariableState('recordHistory', value, type);
    };
    FP.setScrollingSpeed = function(value, type) {
      setVariableState('scrollingSpeed', value, type);
    };
    FP.setFitToSection = function(value, type) {
      setVariableState('fitToSection', value, type);
    };
    FP.setLockAnchors = function(value) {
      options.lockAnchors = value;
    };
    FP.setMouseWheelScrolling = function(value) {
      if (value) {
        addMouseWheelHandler();
      } else {
        removeMouseWheelHandler();
      }
    };
    FP.setAllowScrolling = function(value, directions) {
      if (typeof directions !== 'undefined') {
        directions = directions.replace(/ /g, '').split(',');
        $.each(directions, function(index, direction) {
          setIsScrollAllowed(value, direction, 'm');
        });
      } else if (value) {
        FP.setMouseWheelScrolling(true);
        addTouchHandler();
      } else {
        FP.setMouseWheelScrolling(false);
        removeTouchHandler();
      }
    };
    FP.setKeyboardScrolling = function(value, directions) {
      if (typeof directions !== 'undefined') {
        directions = directions.replace(/ /g, '').split(',');
        $.each(directions, function(index, direction) {
          setIsScrollAllowed(value, direction, 'k');
        });
      } else {
        options.keyboardScrolling = value;
      }
    };
    FP.moveSectionUp = function() {
      var prev = $(SECTION_ACTIVE_SEL).prev(SECTION_SEL);
      if (!prev.length && (options.loopTop || options.continuousVertical)) {
        prev = $(SECTION_SEL).last();
      }
      if (prev.length) {
        scrollPage(prev, null, true);
      }
    };
    FP.moveSectionDown = function() {
      var next = $(SECTION_ACTIVE_SEL).next(SECTION_SEL);
      if (!next.length && (options.loopBottom || options.continuousVertical)) {
        next = $(SECTION_SEL).first();
      }
      if (next.length) {
        scrollPage(next, null, false);
      }
    };
    FP.silentMoveTo = function(sectionAnchor, slideAnchor) {
      requestAnimFrame(function() {
        FP.setScrollingSpeed(0, 'internal');
      });
      FP.moveTo(sectionAnchor, slideAnchor);
      requestAnimFrame(function() {
        FP.setScrollingSpeed(originals.scrollingSpeed, 'internal');
      });
    };
    FP.moveTo = function(sectionAnchor, slideAnchor) {
      var destiny = getSectionByAnchor(sectionAnchor);
      if (typeof slideAnchor !== 'undefined') {
        scrollPageAndSlide(sectionAnchor, slideAnchor);
      } else if (destiny.length > 0) {
        scrollPage(destiny);
      }
    };
    FP.moveSlideRight = function() {
      moveSlide('next');
    };
    FP.moveSlideLeft = function() {
      moveSlide('prev');
    };
    FP.reBuild = function(resizing) {
      if (container.hasClass(DESTROYED)) {
        return;
      }
      requestAnimFrame(function() {
        isResizing = true;
      });
      var windowsWidth = $window.width();
      windowsHeight = $window.height();
      if (options.resize) {
        resizeMe(windowsHeight, windowsWidth);
      }
      $(SECTION_SEL).each(function() {
        var slidesWrap = $(this).find(SLIDES_WRAPPER_SEL);
        var slides = $(this).find(SLIDE_SEL);
        if (options.verticalCentered) {
          $(this).find(TABLE_CELL_SEL).css('height', getTableHeight($(this)) + 'px');
        }
        $(this).css('height', windowsHeight + 'px');
        if (options.scrollOverflow) {
          if (slides.length) {
            slides.each(function() {
              createSlimScrolling($(this));
            });
          } else {
            createSlimScrolling($(this));
          }
        }
        if (slides.length > 1) {
          landscapeScroll(slidesWrap, slidesWrap.find(SLIDE_ACTIVE_SEL));
        }
      });
      var activeSection = $(SECTION_ACTIVE_SEL);
      var sectionIndex = activeSection.index(SECTION_SEL);
      if (sectionIndex) {
        FP.silentMoveTo(sectionIndex + 1);
      }
      requestAnimFrame(function() {
        isResizing = false;
      });
      $.isFunction(options.afterResize) && resizing && options.afterResize.call(container);
      $.isFunction(options.afterReBuild) && !resizing && options.afterReBuild.call(container);
    };
    FP.setResponsive = function(active) {
      var isResponsive = container.hasClass(RESPONSIVE);
      if (active) {
        if (!isResponsive) {
          FP.setAutoScrolling(false, 'internal');
          FP.setFitToSection(false, 'internal');
          $(SECTION_NAV_SEL).hide();
          container.addClass(RESPONSIVE);
        }
      } else if (isResponsive) {
        FP.setAutoScrolling(originals.autoScrolling, 'internal');
        FP.setFitToSection(originals.autoScrolling, 'internal');
        $(SECTION_NAV_SEL).show();
        container.removeClass(RESPONSIVE);
      }
    };
    var slideMoving = false;
    var isTouchDevice = navigator.userAgent.match(/(iPhone|iPod|iPad|Android|playbook|silk|BlackBerry|BB10|Windows Phone|Tizen|Bada|webOS|IEMobile|Opera Mini)/);
    var isTouch = (('ontouchstart' in window) || (navigator.msMaxTouchPoints > 0) || (navigator.maxTouchPoints));
    var container = $(this);
    var windowsHeight = $window.height();
    var isResizing = false;
    var isWindowFocused = true;
    var lastScrolledDestiny;
    var lastScrolledSlide;
    var canScroll = true;
    var scrollings = [];
    var nav;
    var controlPressed;
    var isScrollAllowed = {};
    isScrollAllowed.m = {
      'up': true,
      'down': true,
      'left': true,
      'right': true
    };
    isScrollAllowed.k = $.extend(true, {}, isScrollAllowed.m);
    var originals = $.extend(true, {}, options);
    var resizeId;
    var afterSectionLoadsId;
    var afterSlideLoadsId;
    var scrollId;
    var scrollId2;
    var keydownId;
    if ($(this).length) {
      init();
    }
    function init() {
      if (options.css3) {
        options.css3 = support3d();
      }
      if (!options.anchors.length) {
        options.anchors = $('[data-anchor]').map(function() {
          return $(this).data('anchor').toString();
        }).get();
      }
      prepareDom();
      FP.setAllowScrolling(true);
      windowsHeight = $window.height();
      FP.setAutoScrolling(options.autoScrolling, 'internal');
      var activeSlide = $(SECTION_ACTIVE_SEL).find(SLIDE_ACTIVE_SEL);
      if (activeSlide.length && ($(SECTION_ACTIVE_SEL).index(SECTION_SEL) !== 0 || ($(SECTION_ACTIVE_SEL).index(SECTION_SEL) === 0 && activeSlide.index() !== 0))) {
        silentLandscapeScroll(activeSlide);
      }
      responsive();
      setBodyClass();
      $window.on('load', function() {
        scrollToAnchor();
      });
    }
    function prepareDom() {
      container.css({
        'height': '100%',
        'position': 'relative'
      });
      container.addClass(WRAPPER);
      $('html').addClass(ENABLED);
      container.removeClass(DESTROYED);
      addInternalSelectors();
      $(SECTION_SEL).each(function(index) {
        var section = $(this);
        var slides = section.find(SLIDE_SEL);
        var numSlides = slides.length;
        styleSection(section, index);
        styleMenu(section, index);
        if (numSlides > 0) {
          styleSlides(section, slides, numSlides);
        } else {
          if (options.verticalCentered) {
            addTableClass(section);
          }
        }
      });
      if (options.fixedElements && options.css3) {
        $(options.fixedElements).appendTo($body);
      }
      if (options.navigation) {
        addVerticalNavigation();
      }
      if (options.scrollOverflow) {
        if (document.readyState === 'complete') {
          createSlimScrollingHandler();
        }
        $window.on('load', createSlimScrollingHandler);
      } else {
        afterRenderActions();
      }
    }
    function styleSlides(section, slides, numSlides) {
      var sliderWidth = numSlides * 100;
      var slideWidth = 100 / numSlides;
      slides.wrapAll('<div class="' + SLIDES_CONTAINER + '" />');
      slides.parent().wrap('<div class="' + SLIDES_WRAPPER + '" />');
      section.find(SLIDES_CONTAINER_SEL).css('width', sliderWidth + '%');
      if (numSlides > 1) {
        if (options.controlArrows) {
          createSlideArrows(section);
        }
        if (options.slidesNavigation) {
          addSlidesNavigation(section, numSlides);
        }
      }
      slides.each(function(index) {
        $(this).css('width', slideWidth + '%');
        if (options.verticalCentered) {
          addTableClass($(this));
        }
      });
      var startingSlide = section.find(SLIDE_ACTIVE_SEL);
      if (startingSlide.length && ($(SECTION_ACTIVE_SEL).index(SECTION_SEL) !== 0 || ($(SECTION_ACTIVE_SEL).index(SECTION_SEL) === 0 && startingSlide.index() !== 0))) {
        silentLandscapeScroll(startingSlide);
      } else {
        slides.eq(0).addClass(ACTIVE);
      }
    }
    function styleSection(section, index) {
      if (!index && $(SECTION_ACTIVE_SEL).length === 0) {
        section.addClass(ACTIVE);
      }
      section.css('height', windowsHeight + 'px');
      if (options.paddingTop) {
        section.css('padding-top', options.paddingTop);
      }
      if (options.paddingBottom) {
        section.css('padding-bottom', options.paddingBottom);
      }
      if (typeof options.sectionsColor[index] !== 'undefined') {
        section.css('background-color', options.sectionsColor[index]);
      }
      if (typeof options.anchors[index] !== 'undefined') {
        section.attr('data-anchor', options.anchors[index]);
      }
    }
    function styleMenu(section, index) {
      if (typeof options.anchors[index] !== 'undefined') {
        if (section.hasClass(ACTIVE)) {
          activateMenuAndNav(options.anchors[index], index);
        }
      }
      if (options.menu && options.css3 && $(options.menu).closest(WRAPPER_SEL).length) {
        $(options.menu).appendTo($body);
      }
    }
    function addInternalSelectors() {
      $(options.sectionSelector).each(function() {
        $(this).addClass(SECTION);
      });
      $(options.slideSelector).each(function() {
        $(this).addClass(SLIDE);
      });
    }
    function createSlideArrows(section) {
      section.find(SLIDES_WRAPPER_SEL).after('<div class="' + SLIDES_ARROW_PREV + '"></div><div class="' + SLIDES_ARROW_NEXT + '"></div>');
      if (options.controlArrowColor != '#fff') {
        section.find(SLIDES_ARROW_NEXT_SEL).css('border-color', 'transparent transparent transparent ' + options.controlArrowColor);
        section.find(SLIDES_ARROW_PREV_SEL).css('border-color', 'transparent ' + options.controlArrowColor + ' transparent transparent');
      }
      if (!options.loopHorizontal) {
        section.find(SLIDES_ARROW_PREV_SEL).hide();
      }
    }
    function addVerticalNavigation() {
      $body.append('<div id="' + SECTION_NAV + '"><ul></ul></div>');
      var nav = $(SECTION_NAV_SEL);
      nav.addClass(function() {
        return options.showActiveTooltip ? SHOW_ACTIVE_TOOLTIP + ' ' + options.navigationPosition : options.navigationPosition;
      });
      for (var i = 0; i < $(SECTION_SEL).length; i++) {
        var link = '';
        if (options.anchors.length) {
          link = options.anchors[i];
        }
        var li = '<li><a href="#' + link + '"><span></span></a>';
        var tooltip = options.navigationTooltips[i];
        if (typeof tooltip !== 'undefined' && tooltip !== '') {
          li += '<div class="' + SECTION_NAV_TOOLTIP + ' ' + options.navigationPosition + '">' + tooltip + '</div>';
        }
        li += '</li>';
        nav.find('ul').append(li);
      }
      $(SECTION_NAV_SEL).css('margin-top', '-' + ($(SECTION_NAV_SEL).height() / 2) + 'px');
      $(SECTION_NAV_SEL).find('li').eq($(SECTION_ACTIVE_SEL).index(SECTION_SEL)).find('a').addClass(ACTIVE);
    }
    function createSlimScrollingHandler() {
      $(SECTION_SEL).each(function() {
        var slides = $(this).find(SLIDE_SEL);
        if (slides.length) {
          slides.each(function() {
            createSlimScrolling($(this));
          });
        } else {
          createSlimScrolling($(this));
        }
      });
      afterRenderActions();
    }
    function afterRenderActions() {
      var section = $(SECTION_ACTIVE_SEL);
      solveBugSlimScroll(section);
      lazyLoad(section);
      playMedia(section);
      $.isFunction(options.afterLoad) && options.afterLoad.call(section, section.data('anchor'), (section.index(SECTION_SEL) + 1));
      $.isFunction(options.afterRender) && options.afterRender.call(container);
    }
    function solveBugSlimScroll(section) {
      var slides = section.find('SLIDES_WRAPPER');
      var scrollableWrap = section.find(SCROLLABLE_SEL);
      if (slides.length) {
        scrollableWrap = slides.find(SLIDE_ACTIVE_SEL);
      }
      scrollableWrap.mouseover();
    }
    var isScrolling = false;
    $window.on('scroll', scrollHandler);
    function scrollHandler() {
      var currentSection;
      if (!options.autoScrolling || options.scrollBar) {
        var currentScroll = $window.scrollTop();
        var visibleSectionIndex = 0;
        var initial = Math.abs(currentScroll - document.querySelectorAll(SECTION_SEL)[0].offsetTop);
        var sections = document.querySelectorAll(SECTION_SEL);
        for (var i = 0; i < sections.length; ++i) {
          var section = sections[i];
          var current = Math.abs(currentScroll - section.offsetTop);
          if (current < initial) {
            visibleSectionIndex = i;
            initial = current;
          }
        }
        currentSection = $(sections).eq(visibleSectionIndex);
        if (!currentSection.hasClass(ACTIVE) && !currentSection.hasClass(AUTO_HEIGHT)) {
          isScrolling = true;
          var leavingSection = $(SECTION_ACTIVE_SEL);
          var leavingSectionIndex = leavingSection.index(SECTION_SEL) + 1;
          var yMovement = getYmovement(currentSection);
          var anchorLink = currentSection.data('anchor');
          var sectionIndex = currentSection.index(SECTION_SEL) + 1;
          var activeSlide = currentSection.find(SLIDE_ACTIVE_SEL);
          if (activeSlide.length) {
            var slideAnchorLink = activeSlide.data('anchor');
            var slideIndex = activeSlide.index();
          }
          if (canScroll) {
            currentSection.addClass(ACTIVE).siblings().removeClass(ACTIVE);
            $.isFunction(options.onLeave) && options.onLeave.call(leavingSection, leavingSectionIndex, sectionIndex, yMovement);
            $.isFunction(options.afterLoad) && options.afterLoad.call(currentSection, anchorLink, sectionIndex);
            lazyLoad(currentSection);
            activateMenuAndNav(anchorLink, sectionIndex - 1);
            if (options.anchors.length) {
              lastScrolledDestiny = anchorLink;
              setState(slideIndex, slideAnchorLink, anchorLink, sectionIndex);
            }
          }
          clearTimeout(scrollId);
          scrollId = setTimeout(function() {
            isScrolling = false;
          }, 100);
        }
        if (options.fitToSection) {
          clearTimeout(scrollId2);
          scrollId2 = setTimeout(function() {
            if (canScroll && options.fitToSection) {
              if ($(SECTION_ACTIVE_SEL).is(currentSection)) {
                requestAnimFrame(function() {
                  isResizing = true;
                });
              }
              scrollPage(currentSection);
              requestAnimFrame(function() {
                isResizing = false;
              });
            }
          }, options.fitToSectionDelay);
        }
      }
    }
    function isScrollable(activeSection) {
      if (activeSection.find(SLIDES_WRAPPER_SEL).length) {
        return activeSection.find(SLIDE_ACTIVE_SEL).find(SCROLLABLE_SEL);
      }
      return activeSection.find(SCROLLABLE_SEL);
    }
    function scrolling(type, scrollable) {
      if (!isScrollAllowed.m[type]) {
        return;
      }
      var check,
          scrollSection;
      if (type == 'down') {
        check = 'bottom';
        scrollSection = FP.moveSectionDown;
      } else {
        check = 'top';
        scrollSection = FP.moveSectionUp;
      }
      if (scrollable.length > 0) {
        if (isScrolled(check, scrollable)) {
          scrollSection();
        } else {
          return true;
        }
      } else {
        scrollSection();
      }
    }
    var touchStartY = 0;
    var touchStartX = 0;
    var touchEndY = 0;
    var touchEndX = 0;
    function touchMoveHandler(event) {
      var e = event.originalEvent;
      if (!checkParentForNormalScrollElement(event.target) && isReallyTouch(e)) {
        if (options.autoScrolling) {
          event.preventDefault();
        }
        var activeSection = $(SECTION_ACTIVE_SEL);
        var scrollable = isScrollable(activeSection);
        if (canScroll && !slideMoving) {
          var touchEvents = getEventsPage(e);
          touchEndY = touchEvents.y;
          touchEndX = touchEvents.x;
          if (activeSection.find(SLIDES_WRAPPER_SEL).length && Math.abs(touchStartX - touchEndX) > (Math.abs(touchStartY - touchEndY))) {
            if (Math.abs(touchStartX - touchEndX) > ($window.width() / 100 * options.touchSensitivity)) {
              if (touchStartX > touchEndX) {
                if (isScrollAllowed.m.right) {
                  FP.moveSlideRight();
                }
              } else {
                if (isScrollAllowed.m.left) {
                  FP.moveSlideLeft();
                }
              }
            }
          } else if (options.autoScrolling) {
            if (Math.abs(touchStartY - touchEndY) > ($window.height() / 100 * options.touchSensitivity)) {
              if (touchStartY > touchEndY) {
                scrolling('down', scrollable);
              } else if (touchEndY > touchStartY) {
                scrolling('up', scrollable);
              }
            }
          }
        }
      }
    }
    function checkParentForNormalScrollElement(el, hop) {
      hop = hop || 0;
      var parent = $(el).parent();
      if (hop < options.normalScrollElementTouchThreshold && parent.is(options.normalScrollElements)) {
        return true;
      } else if (hop == options.normalScrollElementTouchThreshold) {
        return false;
      } else {
        return checkParentForNormalScrollElement(parent, ++hop);
      }
    }
    function isReallyTouch(e) {
      return typeof e.pointerType === 'undefined' || e.pointerType != 'mouse';
    }
    function touchStartHandler(event) {
      var e = event.originalEvent;
      if (options.fitToSection) {
        $htmlBody.stop();
      }
      if (isReallyTouch(e)) {
        var touchEvents = getEventsPage(e);
        touchStartY = touchEvents.y;
        touchStartX = touchEvents.x;
      }
    }
    function getAverage(elements, number) {
      var sum = 0;
      var lastElements = elements.slice(Math.max(elements.length - number, 1));
      for (var i = 0; i < lastElements.length; i++) {
        sum = sum + lastElements[i];
      }
      return Math.ceil(sum / number);
    }
    var prevTime = new Date().getTime();
    function MouseWheelHandler(e) {
      var curTime = new Date().getTime();
      if (options.autoScrolling && !controlPressed) {
        e = e || window.event;
        var value = e.wheelDelta || -e.deltaY || -e.detail;
        var delta = Math.max(-1, Math.min(1, value));
        var horizontalDetection = typeof e.wheelDeltaX !== 'undefined' || typeof e.deltaX !== 'undefined';
        var isScrollingVertically = (Math.abs(e.wheelDeltaX) < Math.abs(e.wheelDelta)) || (Math.abs(e.deltaX) < Math.abs(e.deltaY) || !horizontalDetection);
        if (scrollings.length > 149) {
          scrollings.shift();
        }
        scrollings.push(Math.abs(value));
        if (options.scrollBar) {
          e.preventDefault ? e.preventDefault() : e.returnValue = false;
        }
        var activeSection = $(SECTION_ACTIVE_SEL);
        var scrollable = isScrollable(activeSection);
        var timeDiff = curTime - prevTime;
        prevTime = curTime;
        if (timeDiff > 200) {
          scrollings = [];
        }
        if (canScroll) {
          var averageEnd = getAverage(scrollings, 10);
          var averageMiddle = getAverage(scrollings, 70);
          var isAccelerating = averageEnd >= averageMiddle;
          if (isAccelerating && isScrollingVertically) {
            if (delta < 0) {
              scrolling('down', scrollable);
            } else {
              scrolling('up', scrollable);
            }
          }
        }
        return false;
      }
      if (options.fitToSection) {
        $htmlBody.stop();
      }
    }
    function moveSlide(direction) {
      var activeSection = $(SECTION_ACTIVE_SEL);
      var slides = activeSection.find(SLIDES_WRAPPER_SEL);
      var numSlides = slides.find(SLIDE_SEL).length;
      if (!slides.length || slideMoving || numSlides < 2) {
        return;
      }
      var currentSlide = slides.find(SLIDE_ACTIVE_SEL);
      var destiny = null;
      if (direction === 'prev') {
        destiny = currentSlide.prev(SLIDE_SEL);
      } else {
        destiny = currentSlide.next(SLIDE_SEL);
      }
      if (!destiny.length) {
        if (!options.loopHorizontal)
          return;
        if (direction === 'prev') {
          destiny = currentSlide.siblings(':last');
        } else {
          destiny = currentSlide.siblings(':first');
        }
      }
      slideMoving = true;
      landscapeScroll(slides, destiny);
    }
    function keepSlidesPosition() {
      $(SLIDE_ACTIVE_SEL).each(function() {
        silentLandscapeScroll($(this), 'internal');
      });
    }
    window.requestAnimFrame = function() {
      return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(callback) {
        callback();
      };
    }();
    function scrollPage(element, callback, isMovementUp) {
      requestAnimFrame(function() {
        var dest = element.position();
        if (typeof dest === 'undefined') {
          return;
        }
        var dtop = element.hasClass(AUTO_HEIGHT) ? (dest.top - windowsHeight + element.height()) : dest.top;
        var v = {
          element: element,
          callback: callback,
          isMovementUp: isMovementUp,
          dest: dest,
          dtop: dtop,
          yMovement: getYmovement(element),
          anchorLink: element.data('anchor'),
          sectionIndex: element.index(SECTION_SEL),
          activeSlide: element.find(SLIDE_ACTIVE_SEL),
          activeSection: $(SECTION_ACTIVE_SEL),
          leavingSection: $(SECTION_ACTIVE_SEL).index(SECTION_SEL) + 1,
          localIsResizing: isResizing
        };
        if ((v.activeSection.is(element) && !isResizing) || (options.scrollBar && $window.scrollTop() === v.dtop && !element.hasClass(AUTO_HEIGHT))) {
          return;
        }
        if (v.activeSlide.length) {
          var slideAnchorLink = v.activeSlide.data('anchor');
          var slideIndex = v.activeSlide.index();
        }
        if (options.autoScrolling && options.continuousVertical && typeof(v.isMovementUp) !== "undefined" && ((!v.isMovementUp && v.yMovement == 'up') || (v.isMovementUp && v.yMovement == 'down'))) {
          v = createInfiniteSections(v);
        }
        if ($.isFunction(options.onLeave) && !v.localIsResizing) {
          if (options.onLeave.call(v.activeSection, v.leavingSection, (v.sectionIndex + 1), v.yMovement) === false) {
            return;
          } else {
            stopMedia(v.activeSection);
          }
        }
        element.addClass(ACTIVE).siblings().removeClass(ACTIVE);
        lazyLoad(element);
        canScroll = false;
        setState(slideIndex, slideAnchorLink, v.anchorLink, v.sectionIndex);
        performMovement(v);
        lastScrolledDestiny = v.anchorLink;
        activateMenuAndNav(v.anchorLink, v.sectionIndex);
      });
    }
    function performMovement(v) {
      if (options.css3 && options.autoScrolling && !options.scrollBar) {
        var translate3d = 'translate3d(0px, -' + v.dtop + 'px, 0px)';
        transformContainer(translate3d, true);
        if (options.scrollingSpeed) {
          afterSectionLoadsId = setTimeout(function() {
            afterSectionLoads(v);
          }, options.scrollingSpeed);
        } else {
          afterSectionLoads(v);
        }
      } else {
        var scrollSettings = getScrollSettings(v);
        $(scrollSettings.element).animate(scrollSettings.options, options.scrollingSpeed, options.easing).promise().done(function() {
          afterSectionLoads(v);
        });
      }
    }
    function getScrollSettings(v) {
      var scroll = {};
      if (options.autoScrolling && !options.scrollBar) {
        scroll.options = {'top': -v.dtop};
        scroll.element = WRAPPER_SEL;
      } else {
        scroll.options = {'scrollTop': v.dtop};
        scroll.element = 'html, body';
      }
      return scroll;
    }
    function createInfiniteSections(v) {
      if (!v.isMovementUp) {
        $(SECTION_ACTIVE_SEL).after(v.activeSection.prevAll(SECTION_SEL).get().reverse());
      } else {
        $(SECTION_ACTIVE_SEL).before(v.activeSection.nextAll(SECTION_SEL));
      }
      silentScroll($(SECTION_ACTIVE_SEL).position().top);
      keepSlidesPosition();
      v.wrapAroundElements = v.activeSection;
      v.dest = v.element.position();
      v.dtop = v.dest.top;
      v.yMovement = getYmovement(v.element);
      return v;
    }
    function continuousVerticalFixSectionOrder(v) {
      if (!v.wrapAroundElements || !v.wrapAroundElements.length) {
        return;
      }
      if (v.isMovementUp) {
        $(SECTION_FIRST_SEL).before(v.wrapAroundElements);
      } else {
        $(SECTION_LAST_SEL).after(v.wrapAroundElements);
      }
      silentScroll($(SECTION_ACTIVE_SEL).position().top);
      keepSlidesPosition();
    }
    function afterSectionLoads(v) {
      continuousVerticalFixSectionOrder(v);
      v.element.find('.fp-scrollable').mouseover();
      $.isFunction(options.afterLoad) && !v.localIsResizing && options.afterLoad.call(v.element, v.anchorLink, (v.sectionIndex + 1));
      playMedia(v.element);
      canScroll = true;
      $.isFunction(v.callback) && v.callback.call(this);
    }
    function lazyLoad(destiny) {
      var slide = destiny.find(SLIDE_ACTIVE_SEL);
      if (slide.length) {
        destiny = $(slide);
      }
      destiny.find('img[data-src], source[data-src], audio[data-src]').each(function() {
        $(this).attr('src', $(this).data('src'));
        $(this).removeAttr('data-src');
        if ($(this).is('source')) {
          $(this).closest('video').get(0).load();
        }
      });
    }
    function playMedia(destiny) {
      destiny.find('video, audio').each(function() {
        var element = $(this).get(0);
        if (element.hasAttribute('autoplay') && typeof element.play === 'function') {
          element.play();
        }
      });
    }
    function stopMedia(destiny) {
      destiny.find('video, audio').each(function() {
        var element = $(this).get(0);
        if (!element.hasAttribute('data-ignore') && typeof element.pause === 'function') {
          element.pause();
        }
      });
    }
    function scrollToAnchor() {
      var value = window.location.hash.replace('#', '').split('/');
      var section = value[0];
      var slide = value[1];
      if (section) {
        if (options.animateAnchor) {
          scrollPageAndSlide(section, slide);
        } else {
          FP.silentMoveTo(section, slide);
        }
      }
    }
    $window.on('hashchange', hashChangeHandler);
    function hashChangeHandler() {
      if (!isScrolling && !options.lockAnchors) {
        var value = window.location.hash.replace('#', '').split('/');
        var section = value[0];
        var slide = value[1];
        var isFirstSlideMove = (typeof lastScrolledDestiny === 'undefined');
        var isFirstScrollMove = (typeof lastScrolledDestiny === 'undefined' && typeof slide === 'undefined' && !slideMoving);
        if (section.length) {
          if ((section && section !== lastScrolledDestiny) && !isFirstSlideMove || isFirstScrollMove || (!slideMoving && lastScrolledSlide != slide)) {
            scrollPageAndSlide(section, slide);
          }
        }
      }
    }
    $document.keydown(keydownHandler);
    $document.keyup(function(e) {
      if (isWindowFocused) {
        controlPressed = e.ctrlKey;
      }
    });
    $(window).blur(function() {
      isWindowFocused = false;
      controlPressed = false;
    });
    var keydownId;
    function keydownHandler(e) {
      clearTimeout(keydownId);
      var activeElement = $(':focus');
      if (!activeElement.is('textarea') && !activeElement.is('input') && !activeElement.is('select') && options.keyboardScrolling && options.autoScrolling) {
        var keyCode = e.which;
        var keyControls = [40, 38, 32, 33, 34];
        if ($.inArray(keyCode, keyControls) > -1) {
          e.preventDefault();
        }
        controlPressed = e.ctrlKey;
        keydownId = setTimeout(function() {
          onkeydown(e);
        }, 150);
      }
    }
    function onkeydown(e) {
      var shiftPressed = e.shiftKey;
      switch (e.which) {
        case 38:
        case 33:
          if (isScrollAllowed.k.up) {
            FP.moveSectionUp();
          }
          break;
        case 32:
          if (shiftPressed && isScrollAllowed.k.up) {
            FP.moveSectionUp();
            break;
          }
        case 40:
        case 34:
          if (isScrollAllowed.k.down) {
            FP.moveSectionDown();
          }
          break;
        case 36:
          if (isScrollAllowed.k.up) {
            FP.moveTo(1);
          }
          break;
        case 35:
          if (isScrollAllowed.k.down) {
            FP.moveTo($(SECTION_SEL).length);
          }
          break;
        case 37:
          if (isScrollAllowed.k.left) {
            FP.moveSlideLeft();
          }
          break;
        case 39:
          if (isScrollAllowed.k.right) {
            FP.moveSlideRight();
          }
          break;
        default:
          return;
      }
    }
    container.mousedown(function(e) {
      if (e.which == 2) {
        oldPageY = e.pageY;
        container.on('mousemove', mouseMoveHandler);
      }
    });
    container.mouseup(function(e) {
      if (e.which == 2) {
        container.off('mousemove');
      }
    });
    var oldPageY = 0;
    function mouseMoveHandler(e) {
      if (canScroll) {
        if (e.pageY < oldPageY) {
          FP.moveSectionUp();
        } else if (e.pageY > oldPageY) {
          FP.moveSectionDown();
        }
      }
      oldPageY = e.pageY;
    }
    $document.on('click touchstart', SECTION_NAV_SEL + ' a', function(e) {
      e.preventDefault();
      var index = $(this).parent().index();
      scrollPage($(SECTION_SEL).eq(index));
    });
    $document.on('click touchstart', SLIDES_NAV_LINK_SEL, function(e) {
      e.preventDefault();
      var slides = $(this).closest(SECTION_SEL).find(SLIDES_WRAPPER_SEL);
      var destiny = slides.find(SLIDE_SEL).eq($(this).closest('li').index());
      landscapeScroll(slides, destiny);
    });
    if (options.normalScrollElements) {
      $document.on('mouseenter', options.normalScrollElements, function() {
        FP.setMouseWheelScrolling(false);
      });
      $document.on('mouseleave', options.normalScrollElements, function() {
        FP.setMouseWheelScrolling(true);
      });
    }
    $(SECTION_SEL).on('click touchstart', SLIDES_ARROW_SEL, function() {
      if ($(this).hasClass(SLIDES_PREV)) {
        if (isScrollAllowed.m.left) {
          FP.moveSlideLeft();
        }
      } else {
        if (isScrollAllowed.m.right) {
          FP.moveSlideRight();
        }
      }
    });
    function landscapeScroll(slides, destiny) {
      var destinyPos = destiny.position();
      var slideIndex = destiny.index();
      var section = slides.closest(SECTION_SEL);
      var sectionIndex = section.index(SECTION_SEL);
      var anchorLink = section.data('anchor');
      var slidesNav = section.find(SLIDES_NAV_SEL);
      var slideAnchor = getAnchor(destiny);
      var localIsResizing = isResizing;
      if (options.onSlideLeave) {
        var prevSlide = section.find(SLIDE_ACTIVE_SEL);
        var prevSlideIndex = prevSlide.index();
        var xMovement = getXmovement(prevSlideIndex, slideIndex);
        if (!localIsResizing && xMovement !== 'none') {
          if ($.isFunction(options.onSlideLeave)) {
            if (options.onSlideLeave.call(prevSlide, anchorLink, (sectionIndex + 1), prevSlideIndex, xMovement, slideIndex) === false) {
              slideMoving = false;
              return;
            }
          }
        }
      }
      destiny.addClass(ACTIVE).siblings().removeClass(ACTIVE);
      if (!localIsResizing) {
        lazyLoad(destiny);
      }
      if (!options.loopHorizontal && options.controlArrows) {
        section.find(SLIDES_ARROW_PREV_SEL).toggle(slideIndex !== 0);
        section.find(SLIDES_ARROW_NEXT_SEL).toggle(!destiny.is(':last-child'));
      }
      if (section.hasClass(ACTIVE)) {
        setState(slideIndex, slideAnchor, anchorLink, sectionIndex);
      }
      var afterSlideLoads = function() {
        if (!localIsResizing) {
          $.isFunction(options.afterSlideLoad) && options.afterSlideLoad.call(destiny, anchorLink, (sectionIndex + 1), slideAnchor, slideIndex);
        }
        slideMoving = false;
      };
      if (options.css3) {
        var translate3d = 'translate3d(-' + Math.round(destinyPos.left) + 'px, 0px, 0px)';
        addAnimation(slides.find(SLIDES_CONTAINER_SEL), options.scrollingSpeed > 0).css(getTransforms(translate3d));
        afterSlideLoadsId = setTimeout(function() {
          afterSlideLoads();
        }, options.scrollingSpeed, options.easing);
      } else {
        slides.animate({scrollLeft: Math.round(destinyPos.left)}, options.scrollingSpeed, options.easing, function() {
          afterSlideLoads();
        });
      }
      slidesNav.find(ACTIVE_SEL).removeClass(ACTIVE);
      slidesNav.find('li').eq(slideIndex).find('a').addClass(ACTIVE);
    }
    $window.resize(resizeHandler);
    var previousHeight = windowsHeight;
    function resizeHandler() {
      responsive();
      if (isTouchDevice) {
        var activeElement = $(document.activeElement);
        if (!activeElement.is('textarea') && !activeElement.is('input') && !activeElement.is('select')) {
          var currentHeight = $window.height();
          if (Math.abs(currentHeight - previousHeight) > (20 * Math.max(previousHeight, currentHeight) / 100)) {
            FP.reBuild(true);
            previousHeight = currentHeight;
          }
        }
      } else {
        clearTimeout(resizeId);
        resizeId = setTimeout(function() {
          FP.reBuild(true);
        }, 350);
      }
    }
    function responsive() {
      var widthLimit = options.responsive || options.responsiveWidth;
      var heightLimit = options.responsiveHeight;
      var isBreakingPointWidth = widthLimit && $window.width() < widthLimit;
      var isBreakingPointHeight = heightLimit && $window.height() < heightLimit;
      if (widthLimit && heightLimit) {
        FP.setResponsive(isBreakingPointWidth || isBreakingPointHeight);
      } else if (widthLimit) {
        FP.setResponsive(isBreakingPointWidth);
      } else if (heightLimit) {
        FP.setResponsive(isBreakingPointHeight);
      }
    }
    function addAnimation(element) {
      var transition = 'all ' + options.scrollingSpeed + 'ms ' + options.easingcss3;
      element.removeClass(NO_TRANSITION);
      return element.css({
        '-webkit-transition': transition,
        'transition': transition
      });
    }
    function removeAnimation(element) {
      return element.addClass(NO_TRANSITION);
    }
    function resizeMe(displayHeight, displayWidth) {
      var preferredHeight = 825;
      var preferredWidth = 900;
      if (displayHeight < preferredHeight || displayWidth < preferredWidth) {
        var heightPercentage = (displayHeight * 100) / preferredHeight;
        var widthPercentage = (displayWidth * 100) / preferredWidth;
        var percentage = Math.min(heightPercentage, widthPercentage);
        var newFontSize = percentage.toFixed(2);
        $body.css('font-size', newFontSize + '%');
      } else {
        $body.css('font-size', '100%');
      }
    }
    function activateNavDots(name, sectionIndex) {
      if (options.navigation) {
        $(SECTION_NAV_SEL).find(ACTIVE_SEL).removeClass(ACTIVE);
        if (name) {
          $(SECTION_NAV_SEL).find('a[href="#' + name + '"]').addClass(ACTIVE);
        } else {
          $(SECTION_NAV_SEL).find('li').eq(sectionIndex).find('a').addClass(ACTIVE);
        }
      }
    }
    function activateMenuElement(name) {
      if (options.menu) {
        $(options.menu).find(ACTIVE_SEL).removeClass(ACTIVE);
        $(options.menu).find('[data-menuanchor="' + name + '"]').addClass(ACTIVE);
      }
    }
    function activateMenuAndNav(anchor, index) {
      activateMenuElement(anchor);
      activateNavDots(anchor, index);
    }
    function isScrolled(type, scrollable) {
      if (type === 'top') {
        return !scrollable.scrollTop();
      } else if (type === 'bottom') {
        return scrollable.scrollTop() + 1 + scrollable.innerHeight() >= scrollable[0].scrollHeight;
      }
    }
    function getYmovement(destiny) {
      var fromIndex = $(SECTION_ACTIVE_SEL).index(SECTION_SEL);
      var toIndex = destiny.index(SECTION_SEL);
      if (fromIndex == toIndex) {
        return 'none';
      }
      if (fromIndex > toIndex) {
        return 'up';
      }
      return 'down';
    }
    function getXmovement(fromIndex, toIndex) {
      if (fromIndex == toIndex) {
        return 'none';
      }
      if (fromIndex > toIndex) {
        return 'left';
      }
      return 'right';
    }
    function createSlimScrolling(element) {
      element.css('overflow', 'hidden');
      var section = element.closest(SECTION_SEL);
      var scrollable = element.find(SCROLLABLE_SEL);
      var contentHeight;
      if (scrollable.length) {
        contentHeight = scrollable.get(0).scrollHeight;
      } else {
        contentHeight = element.get(0).scrollHeight;
        if (options.verticalCentered) {
          contentHeight = element.find(TABLE_CELL_SEL).get(0).scrollHeight;
        }
      }
      var scrollHeight = windowsHeight - parseInt(section.css('padding-bottom')) - parseInt(section.css('padding-top'));
      if (contentHeight > scrollHeight) {
        if (scrollable.length) {
          scrollable.css('height', scrollHeight + 'px').parent().css('height', scrollHeight + 'px');
        } else {
          if (options.verticalCentered) {
            element.find(TABLE_CELL_SEL).wrapInner('<div class="' + SCROLLABLE + '" />');
          } else {
            element.wrapInner('<div class="' + SCROLLABLE + '" />');
          }
          element.find(SCROLLABLE_SEL).slimScroll({
            allowPageScroll: true,
            height: scrollHeight + 'px',
            size: '10px',
            alwaysVisible: true
          });
        }
      } else {
        removeSlimScroll(element);
      }
      element.css('overflow', '');
    }
    function removeSlimScroll(element) {
      element.find(SCROLLABLE_SEL).children().first().unwrap().unwrap();
      element.find(SLIMSCROLL_BAR_SEL).remove();
      element.find(SLIMSCROLL_RAIL_SEL).remove();
    }
    function addTableClass(element) {
      element.addClass(TABLE).wrapInner('<div class="' + TABLE_CELL + '" style="height:' + getTableHeight(element) + 'px;" />');
    }
    function getTableHeight(element) {
      var sectionHeight = windowsHeight;
      if (options.paddingTop || options.paddingBottom) {
        var section = element;
        if (!section.hasClass(SECTION)) {
          section = element.closest(SECTION_SEL);
        }
        var paddings = parseInt(section.css('padding-top')) + parseInt(section.css('padding-bottom'));
        sectionHeight = (windowsHeight - paddings);
      }
      return sectionHeight;
    }
    function transformContainer(translate3d, animated) {
      if (animated) {
        addAnimation(container);
      } else {
        removeAnimation(container);
      }
      container.css(getTransforms(translate3d));
      setTimeout(function() {
        container.removeClass(NO_TRANSITION);
      }, 10);
    }
    function getSectionByAnchor(sectionAnchor) {
      var section = $(SECTION_SEL + '[data-anchor="' + sectionAnchor + '"]');
      if (!section.length) {
        section = $(SECTION_SEL).eq((sectionAnchor - 1));
      }
      return section;
    }
    function getSlideByAnchor(slideAnchor, section) {
      var slides = section.find(SLIDES_WRAPPER_SEL);
      var slide = slides.find(SLIDE_SEL + '[data-anchor="' + slideAnchor + '"]');
      if (!slide.length) {
        slide = slides.find(SLIDE_SEL).eq(slideAnchor);
      }
      return slide;
    }
    function scrollPageAndSlide(destiny, slide) {
      var section = getSectionByAnchor(destiny);
      if (typeof slide === 'undefined') {
        slide = 0;
      }
      if (destiny !== lastScrolledDestiny && !section.hasClass(ACTIVE)) {
        scrollPage(section, function() {
          scrollSlider(section, slide);
        });
      } else {
        scrollSlider(section, slide);
      }
    }
    function scrollSlider(section, slideAnchor) {
      if (typeof slideAnchor !== 'undefined') {
        var slides = section.find(SLIDES_WRAPPER_SEL);
        var destiny = getSlideByAnchor(slideAnchor, section);
        if (destiny.length) {
          landscapeScroll(slides, destiny);
        }
      }
    }
    function addSlidesNavigation(section, numSlides) {
      section.append('<div class="' + SLIDES_NAV + '"><ul></ul></div>');
      var nav = section.find(SLIDES_NAV_SEL);
      nav.addClass(options.slidesNavPosition);
      for (var i = 0; i < numSlides; i++) {
        nav.find('ul').append('<li><a href="#"><span></span></a></li>');
      }
      nav.css('margin-left', '-' + (nav.width() / 2) + 'px');
      nav.find('li').first().find('a').addClass(ACTIVE);
    }
    function setState(slideIndex, slideAnchor, anchorLink, sectionIndex) {
      var sectionHash = '';
      if (options.anchors.length && !options.lockAnchors) {
        if (slideIndex) {
          if (typeof anchorLink !== 'undefined') {
            sectionHash = anchorLink;
          }
          if (typeof slideAnchor === 'undefined') {
            slideAnchor = slideIndex;
          }
          lastScrolledSlide = slideAnchor;
          setUrlHash(sectionHash + '/' + slideAnchor);
        } else if (typeof slideIndex !== 'undefined') {
          lastScrolledSlide = slideAnchor;
          setUrlHash(anchorLink);
        } else {
          setUrlHash(anchorLink);
        }
      }
      setBodyClass();
    }
    function setUrlHash(url) {
      if (options.recordHistory) {
        location.hash = url;
      } else {
        if (isTouchDevice || isTouch) {
          history.replaceState(undefined, undefined, '#' + url);
        } else {
          var baseUrl = window.location.href.split('#')[0];
          window.location.replace(baseUrl + '#' + url);
        }
      }
    }
    function getAnchor(element) {
      var anchor = element.data('anchor');
      var index = element.index();
      if (typeof anchor === 'undefined') {
        anchor = index;
      }
      return anchor;
    }
    function setBodyClass() {
      var section = $(SECTION_ACTIVE_SEL);
      var slide = section.find(SLIDE_ACTIVE_SEL);
      var sectionAnchor = getAnchor(section);
      var slideAnchor = getAnchor(slide);
      var sectionIndex = section.index(SECTION_SEL);
      var text = String(sectionAnchor);
      if (slide.length) {
        text = text + '-' + slideAnchor;
      }
      text = text.replace('/', '-').replace('#', '');
      var classRe = new RegExp('\\b\\s?' + VIEWING_PREFIX + '-[^\\s]+\\b', "g");
      $body[0].className = $body[0].className.replace(classRe, '');
      $body.addClass(VIEWING_PREFIX + '-' + text);
    }
    function support3d() {
      var el = document.createElement('p'),
          has3d,
          transforms = {
            'webkitTransform': '-webkit-transform',
            'OTransform': '-o-transform',
            'msTransform': '-ms-transform',
            'MozTransform': '-moz-transform',
            'transform': 'transform'
          };
      document.body.insertBefore(el, null);
      for (var t in transforms) {
        if (el.style[t] !== undefined) {
          el.style[t] = 'translate3d(1px,1px,1px)';
          has3d = window.getComputedStyle(el).getPropertyValue(transforms[t]);
        }
      }
      document.body.removeChild(el);
      return (has3d !== undefined && has3d.length > 0 && has3d !== 'none');
    }
    function removeMouseWheelHandler() {
      if (document.addEventListener) {
        document.removeEventListener('mousewheel', MouseWheelHandler, false);
        document.removeEventListener('wheel', MouseWheelHandler, false);
        document.removeEventListener('MozMousePixelScroll', MouseWheelHandler, false);
      } else {
        document.detachEvent('onmousewheel', MouseWheelHandler);
      }
    }
    function addMouseWheelHandler() {
      var prefix = '';
      var _addEventListener;
      if (window.addEventListener) {
        _addEventListener = "addEventListener";
      } else {
        _addEventListener = "attachEvent";
        prefix = 'on';
      }
      var support = 'onwheel' in document.createElement('div') ? 'wheel' : document.onmousewheel !== undefined ? 'mousewheel' : 'DOMMouseScroll';
      if (support == 'DOMMouseScroll') {
        document[_addEventListener](prefix + 'MozMousePixelScroll', MouseWheelHandler, false);
      } else {
        document[_addEventListener](prefix + support, MouseWheelHandler, false);
      }
    }
    function addTouchHandler() {
      if (isTouchDevice || isTouch) {
        var MSPointer = getMSPointer();
        $(WRAPPER_SEL).off('touchstart ' + MSPointer.down).on('touchstart ' + MSPointer.down, touchStartHandler);
        $(WRAPPER_SEL).off('touchmove ' + MSPointer.move).on('touchmove ' + MSPointer.move, touchMoveHandler);
      }
    }
    function removeTouchHandler() {
      if (isTouchDevice || isTouch) {
        var MSPointer = getMSPointer();
        $(WRAPPER_SEL).off('touchstart ' + MSPointer.down);
        $(WRAPPER_SEL).off('touchmove ' + MSPointer.move);
      }
    }
    function getMSPointer() {
      var pointer;
      if (window.PointerEvent) {
        pointer = {
          down: 'pointerdown',
          move: 'pointermove'
        };
      } else {
        pointer = {
          down: 'MSPointerDown',
          move: 'MSPointerMove'
        };
      }
      return pointer;
    }
    function getEventsPage(e) {
      var events = [];
      events.y = (typeof e.pageY !== 'undefined' && (e.pageY || e.pageX) ? e.pageY : e.touches[0].pageY);
      events.x = (typeof e.pageX !== 'undefined' && (e.pageY || e.pageX) ? e.pageX : e.touches[0].pageX);
      if (isTouch && isReallyTouch(e) && options.scrollBar) {
        events.y = e.touches[0].pageY;
        events.x = e.touches[0].pageX;
      }
      return events;
    }
    function silentLandscapeScroll(activeSlide, noCallbacks) {
      FP.setScrollingSpeed(0, 'internal');
      if (typeof noCallbacks !== 'undefined') {
        isResizing = true;
      }
      landscapeScroll(activeSlide.closest(SLIDES_WRAPPER_SEL), activeSlide);
      if (typeof noCallbacks !== 'undefined') {
        isResizing = false;
      }
      FP.setScrollingSpeed(originals.scrollingSpeed, 'internal');
    }
    function silentScroll(top) {
      if (options.scrollBar) {
        container.scrollTop(top);
      } else if (options.css3) {
        var translate3d = 'translate3d(0px, -' + top + 'px, 0px)';
        transformContainer(translate3d, false);
      } else {
        container.css('top', -top);
      }
    }
    function getTransforms(translate3d) {
      return {
        '-webkit-transform': translate3d,
        '-moz-transform': translate3d,
        '-ms-transform': translate3d,
        'transform': translate3d
      };
    }
    function setIsScrollAllowed(value, direction, type) {
      switch (direction) {
        case 'up':
          isScrollAllowed[type].up = value;
          break;
        case 'down':
          isScrollAllowed[type].down = value;
          break;
        case 'left':
          isScrollAllowed[type].left = value;
          break;
        case 'right':
          isScrollAllowed[type].right = value;
          break;
        case 'all':
          if (type == 'm') {
            FP.setAllowScrolling(value);
          } else {
            FP.setKeyboardScrolling(value);
          }
      }
    }
    FP.destroy = function(all) {
      FP.setAutoScrolling(false, 'internal');
      FP.setAllowScrolling(false);
      FP.setKeyboardScrolling(false);
      container.addClass(DESTROYED);
      clearTimeout(afterSlideLoadsId);
      clearTimeout(afterSectionLoadsId);
      clearTimeout(resizeId);
      clearTimeout(scrollId);
      clearTimeout(scrollId2);
      $window.off('scroll', scrollHandler).off('hashchange', hashChangeHandler).off('resize', resizeHandler);
      $document.off('click', SECTION_NAV_SEL + ' a').off('mouseenter', SECTION_NAV_SEL + ' li').off('mouseleave', SECTION_NAV_SEL + ' li').off('click', SLIDES_NAV_LINK_SEL).off('mouseover', options.normalScrollElements).off('mouseout', options.normalScrollElements);
      $(SECTION_SEL).off('click', SLIDES_ARROW_SEL);
      clearTimeout(afterSlideLoadsId);
      clearTimeout(afterSectionLoadsId);
      if (all) {
        destroyStructure();
      }
    };
    function destroyStructure() {
      silentScroll(0);
      $(SECTION_NAV_SEL + ', ' + SLIDES_NAV_SEL + ', ' + SLIDES_ARROW_SEL).remove();
      $(SECTION_SEL).css({
        'height': '',
        'background-color': '',
        'padding': ''
      });
      $(SLIDE_SEL).css({'width': ''});
      container.css({
        'height': '',
        'position': '',
        '-ms-touch-action': '',
        'touch-action': ''
      });
      $htmlBody.css({
        'overflow': '',
        'height': ''
      });
      $('html').removeClass(ENABLED);
      $.each($body.get(0).className.split(/\s+/), function(index, className) {
        if (className.indexOf(VIEWING_PREFIX) === 0) {
          $body.removeClass(className);
        }
      });
      $(SECTION_SEL + ', ' + SLIDE_SEL).each(function() {
        removeSlimScroll($(this));
        $(this).removeClass(TABLE + ' ' + ACTIVE);
      });
      removeAnimation(container);
      container.find(TABLE_CELL_SEL + ', ' + SLIDES_CONTAINER_SEL + ', ' + SLIDES_WRAPPER_SEL).each(function() {
        $(this).replaceWith(this.childNodes);
      });
      $htmlBody.scrollTop(0);
    }
    function setVariableState(variable, value, type) {
      options[variable] = value;
      if (type !== 'internal') {
        originals[variable] = value;
      }
    }
    function displayWarnings() {
      if (options.continuousVertical && (options.loopTop || options.loopBottom)) {
        options.continuousVertical = false;
        showError('warn', 'Option `loopTop/loopBottom` is mutually exclusive with `continuousVertical`; `continuousVertical` disabled');
      }
      if (options.scrollBar && options.scrollOverflow) {
        showError('warn', 'Option `scrollBar` is mutually exclusive with `scrollOverflow`. Sections with scrollOverflow might not work well in Firefox');
      }
      if (options.continuousVertical && options.scrollBar) {
        options.continuousVertical = false;
        showError('warn', 'Option `scrollBar` is mutually exclusive with `continuousVertical`; `continuousVertical` disabled');
      }
      $.each(options.anchors, function(index, name) {
        if ($('#' + name).length || $('[name="' + name + '"]').length) {
          showError('error', 'data-anchor tags can not have the same value as any `id` element on the site (or `name` element for IE).');
        }
      });
    }
    function showError(type, text) {
      console && console[type] && console[type]('fullPage: ' + text);
    }
  };
});

_removeDefine();
})();
(function() {
var _removeDefine = $__System.get("@@amd-helpers").createDefine();
define("1c", ["1b"], function(main) {
  return main;
});

_removeDefine();
})();
$__System.registerDynamic("1d", [], false, function(__require, __exports, __module) {
  var _retrieveGlobal = $__System.get("@@global-helpers").prepareGlobal(__module.id, null, null);
  (function() {
    if (typeof Object.create !== "function") {
      Object.create = function(obj) {
        function F() {}
        F.prototype = obj;
        return new F();
      };
    }
    (function($, window, document) {
      var Carousel = {
        init: function(options, el) {
          var base = this;
          base.$elem = $(el);
          base.options = $.extend({}, $.fn.owlCarousel.options, base.$elem.data(), options);
          base.userOptions = options;
          base.loadContent();
        },
        loadContent: function() {
          var base = this,
              url;
          function getData(data) {
            var i,
                content = "";
            if (typeof base.options.jsonSuccess === "function") {
              base.options.jsonSuccess.apply(this, [data]);
            } else {
              for (i in data.owl) {
                if (data.owl.hasOwnProperty(i)) {
                  content += data.owl[i].item;
                }
              }
              base.$elem.html(content);
            }
            base.logIn();
          }
          if (typeof base.options.beforeInit === "function") {
            base.options.beforeInit.apply(this, [base.$elem]);
          }
          if (typeof base.options.jsonPath === "string") {
            url = base.options.jsonPath;
            $.getJSON(url, getData);
          } else {
            base.logIn();
          }
        },
        logIn: function() {
          var base = this;
          base.$elem.data("owl-originalStyles", base.$elem.attr("style")).data("owl-originalClasses", base.$elem.attr("class"));
          base.$elem.css({opacity: 0});
          base.orignalItems = base.options.items;
          base.checkBrowser();
          base.wrapperWidth = 0;
          base.checkVisible = null;
          base.setVars();
        },
        setVars: function() {
          var base = this;
          if (base.$elem.children().length === 0) {
            return false;
          }
          base.baseClass();
          base.eventTypes();
          base.$userItems = base.$elem.children();
          base.itemsAmount = base.$userItems.length;
          base.wrapItems();
          base.$owlItems = base.$elem.find(".owl-item");
          base.$owlWrapper = base.$elem.find(".owl-wrapper");
          base.playDirection = "next";
          base.prevItem = 0;
          base.prevArr = [0];
          base.currentItem = 0;
          base.customEvents();
          base.onStartup();
        },
        onStartup: function() {
          var base = this;
          base.updateItems();
          base.calculateAll();
          base.buildControls();
          base.updateControls();
          base.response();
          base.moveEvents();
          base.stopOnHover();
          base.owlStatus();
          if (base.options.transitionStyle !== false) {
            base.transitionTypes(base.options.transitionStyle);
          }
          if (base.options.autoPlay === true) {
            base.options.autoPlay = 5000;
          }
          base.play();
          base.$elem.find(".owl-wrapper").css("display", "block");
          if (!base.$elem.is(":visible")) {
            base.watchVisibility();
          } else {
            base.$elem.css("opacity", 1);
          }
          base.onstartup = false;
          base.eachMoveUpdate();
          if (typeof base.options.afterInit === "function") {
            base.options.afterInit.apply(this, [base.$elem]);
          }
        },
        eachMoveUpdate: function() {
          var base = this;
          if (base.options.lazyLoad === true) {
            base.lazyLoad();
          }
          if (base.options.autoHeight === true) {
            base.autoHeight();
          }
          base.onVisibleItems();
          if (typeof base.options.afterAction === "function") {
            base.options.afterAction.apply(this, [base.$elem]);
          }
        },
        updateVars: function() {
          var base = this;
          if (typeof base.options.beforeUpdate === "function") {
            base.options.beforeUpdate.apply(this, [base.$elem]);
          }
          base.watchVisibility();
          base.updateItems();
          base.calculateAll();
          base.updatePosition();
          base.updateControls();
          base.eachMoveUpdate();
          if (typeof base.options.afterUpdate === "function") {
            base.options.afterUpdate.apply(this, [base.$elem]);
          }
        },
        reload: function() {
          var base = this;
          window.setTimeout(function() {
            base.updateVars();
          }, 0);
        },
        watchVisibility: function() {
          var base = this;
          if (base.$elem.is(":visible") === false) {
            base.$elem.css({opacity: 0});
            window.clearInterval(base.autoPlayInterval);
            window.clearInterval(base.checkVisible);
          } else {
            return false;
          }
          base.checkVisible = window.setInterval(function() {
            if (base.$elem.is(":visible")) {
              base.reload();
              base.$elem.animate({opacity: 1}, 200);
              window.clearInterval(base.checkVisible);
            }
          }, 500);
        },
        wrapItems: function() {
          var base = this;
          base.$userItems.wrapAll("<div class=\"owl-wrapper\">").wrap("<div class=\"owl-item\"></div>");
          base.$elem.find(".owl-wrapper").wrap("<div class=\"owl-wrapper-outer\">");
          base.wrapperOuter = base.$elem.find(".owl-wrapper-outer");
          base.$elem.css("display", "block");
        },
        baseClass: function() {
          var base = this,
              hasBaseClass = base.$elem.hasClass(base.options.baseClass),
              hasThemeClass = base.$elem.hasClass(base.options.theme);
          if (!hasBaseClass) {
            base.$elem.addClass(base.options.baseClass);
          }
          if (!hasThemeClass) {
            base.$elem.addClass(base.options.theme);
          }
        },
        updateItems: function() {
          var base = this,
              width,
              i;
          if (base.options.responsive === false) {
            return false;
          }
          if (base.options.singleItem === true) {
            base.options.items = base.orignalItems = 1;
            base.options.itemsCustom = false;
            base.options.itemsDesktop = false;
            base.options.itemsDesktopSmall = false;
            base.options.itemsTablet = false;
            base.options.itemsTabletSmall = false;
            base.options.itemsMobile = false;
            return false;
          }
          width = $(base.options.responsiveBaseWidth).width();
          if (width > (base.options.itemsDesktop[0] || base.orignalItems)) {
            base.options.items = base.orignalItems;
          }
          if (base.options.itemsCustom !== false) {
            base.options.itemsCustom.sort(function(a, b) {
              return a[0] - b[0];
            });
            for (i = 0; i < base.options.itemsCustom.length; i += 1) {
              if (base.options.itemsCustom[i][0] <= width) {
                base.options.items = base.options.itemsCustom[i][1];
              }
            }
          } else {
            if (width <= base.options.itemsDesktop[0] && base.options.itemsDesktop !== false) {
              base.options.items = base.options.itemsDesktop[1];
            }
            if (width <= base.options.itemsDesktopSmall[0] && base.options.itemsDesktopSmall !== false) {
              base.options.items = base.options.itemsDesktopSmall[1];
            }
            if (width <= base.options.itemsTablet[0] && base.options.itemsTablet !== false) {
              base.options.items = base.options.itemsTablet[1];
            }
            if (width <= base.options.itemsTabletSmall[0] && base.options.itemsTabletSmall !== false) {
              base.options.items = base.options.itemsTabletSmall[1];
            }
            if (width <= base.options.itemsMobile[0] && base.options.itemsMobile !== false) {
              base.options.items = base.options.itemsMobile[1];
            }
          }
          if (base.options.items > base.itemsAmount && base.options.itemsScaleUp === true) {
            base.options.items = base.itemsAmount;
          }
        },
        response: function() {
          var base = this,
              smallDelay,
              lastWindowWidth;
          if (base.options.responsive !== true) {
            return false;
          }
          lastWindowWidth = $(window).width();
          base.resizer = function() {
            if ($(window).width() !== lastWindowWidth) {
              if (base.options.autoPlay !== false) {
                window.clearInterval(base.autoPlayInterval);
              }
              window.clearTimeout(smallDelay);
              smallDelay = window.setTimeout(function() {
                lastWindowWidth = $(window).width();
                base.updateVars();
              }, base.options.responsiveRefreshRate);
            }
          };
          $(window).resize(base.resizer);
        },
        updatePosition: function() {
          var base = this;
          base.jumpTo(base.currentItem);
          if (base.options.autoPlay !== false) {
            base.checkAp();
          }
        },
        appendItemsSizes: function() {
          var base = this,
              roundPages = 0,
              lastItem = base.itemsAmount - base.options.items;
          base.$owlItems.each(function(index) {
            var $this = $(this);
            $this.css({"width": base.itemWidth}).data("owl-item", Number(index));
            if (index % base.options.items === 0 || index === lastItem) {
              if (!(index > lastItem)) {
                roundPages += 1;
              }
            }
            $this.data("owl-roundPages", roundPages);
          });
        },
        appendWrapperSizes: function() {
          var base = this,
              width = base.$owlItems.length * base.itemWidth;
          base.$owlWrapper.css({
            "width": width * 2,
            "left": 0
          });
          base.appendItemsSizes();
        },
        calculateAll: function() {
          var base = this;
          base.calculateWidth();
          base.appendWrapperSizes();
          base.loops();
          base.max();
        },
        calculateWidth: function() {
          var base = this;
          base.itemWidth = Math.round(base.$elem.width() / base.options.items);
        },
        max: function() {
          var base = this,
              maximum = ((base.itemsAmount * base.itemWidth) - base.options.items * base.itemWidth) * -1;
          if (base.options.items > base.itemsAmount) {
            base.maximumItem = 0;
            maximum = 0;
            base.maximumPixels = 0;
          } else {
            base.maximumItem = base.itemsAmount - base.options.items;
            base.maximumPixels = maximum;
          }
          return maximum;
        },
        min: function() {
          return 0;
        },
        loops: function() {
          var base = this,
              prev = 0,
              elWidth = 0,
              i,
              item,
              roundPageNum;
          base.positionsInArray = [0];
          base.pagesInArray = [];
          for (i = 0; i < base.itemsAmount; i += 1) {
            elWidth += base.itemWidth;
            base.positionsInArray.push(-elWidth);
            if (base.options.scrollPerPage === true) {
              item = $(base.$owlItems[i]);
              roundPageNum = item.data("owl-roundPages");
              if (roundPageNum !== prev) {
                base.pagesInArray[prev] = base.positionsInArray[i];
                prev = roundPageNum;
              }
            }
          }
        },
        buildControls: function() {
          var base = this;
          if (base.options.navigation === true || base.options.pagination === true) {
            base.owlControls = $("<div class=\"owl-controls\"/>").toggleClass("clickable", !base.browser.isTouch).appendTo(base.$elem);
          }
          if (base.options.pagination === true) {
            base.buildPagination();
          }
          if (base.options.navigation === true) {
            base.buildButtons();
          }
        },
        buildButtons: function() {
          var base = this,
              buttonsWrapper = $("<div class=\"owl-buttons\"/>");
          base.owlControls.append(buttonsWrapper);
          base.buttonPrev = $("<div/>", {
            "class": "owl-prev",
            "html": base.options.navigationText[0] || ""
          });
          base.buttonNext = $("<div/>", {
            "class": "owl-next",
            "html": base.options.navigationText[1] || ""
          });
          buttonsWrapper.append(base.buttonPrev).append(base.buttonNext);
          buttonsWrapper.on("touchstart.owlControls mousedown.owlControls", "div[class^=\"owl\"]", function(event) {
            event.preventDefault();
          });
          buttonsWrapper.on("touchend.owlControls mouseup.owlControls", "div[class^=\"owl\"]", function(event) {
            event.preventDefault();
            if ($(this).hasClass("owl-next")) {
              base.next();
            } else {
              base.prev();
            }
          });
        },
        buildPagination: function() {
          var base = this;
          base.paginationWrapper = $("<div class=\"owl-pagination\"/>");
          base.owlControls.append(base.paginationWrapper);
          base.paginationWrapper.on("touchend.owlControls mouseup.owlControls", ".owl-page", function(event) {
            event.preventDefault();
            if (Number($(this).data("owl-page")) !== base.currentItem) {
              base.goTo(Number($(this).data("owl-page")), true);
            }
          });
        },
        updatePagination: function() {
          var base = this,
              counter,
              lastPage,
              lastItem,
              i,
              paginationButton,
              paginationButtonInner;
          if (base.options.pagination === false) {
            return false;
          }
          base.paginationWrapper.html("");
          counter = 0;
          lastPage = base.itemsAmount - base.itemsAmount % base.options.items;
          for (i = 0; i < base.itemsAmount; i += 1) {
            if (i % base.options.items === 0) {
              counter += 1;
              if (lastPage === i) {
                lastItem = base.itemsAmount - base.options.items;
              }
              paginationButton = $("<div/>", {"class": "owl-page"});
              paginationButtonInner = $("<span></span>", {
                "text": base.options.paginationNumbers === true ? counter : "",
                "class": base.options.paginationNumbers === true ? "owl-numbers" : ""
              });
              paginationButton.append(paginationButtonInner);
              paginationButton.data("owl-page", lastPage === i ? lastItem : i);
              paginationButton.data("owl-roundPages", counter);
              base.paginationWrapper.append(paginationButton);
            }
          }
          base.checkPagination();
        },
        checkPagination: function() {
          var base = this;
          if (base.options.pagination === false) {
            return false;
          }
          base.paginationWrapper.find(".owl-page").each(function() {
            if ($(this).data("owl-roundPages") === $(base.$owlItems[base.currentItem]).data("owl-roundPages")) {
              base.paginationWrapper.find(".owl-page").removeClass("active");
              $(this).addClass("active");
            }
          });
        },
        checkNavigation: function() {
          var base = this;
          if (base.options.navigation === false) {
            return false;
          }
          if (base.options.rewindNav === false) {
            if (base.currentItem === 0 && base.maximumItem === 0) {
              base.buttonPrev.addClass("disabled");
              base.buttonNext.addClass("disabled");
            } else if (base.currentItem === 0 && base.maximumItem !== 0) {
              base.buttonPrev.addClass("disabled");
              base.buttonNext.removeClass("disabled");
            } else if (base.currentItem === base.maximumItem) {
              base.buttonPrev.removeClass("disabled");
              base.buttonNext.addClass("disabled");
            } else if (base.currentItem !== 0 && base.currentItem !== base.maximumItem) {
              base.buttonPrev.removeClass("disabled");
              base.buttonNext.removeClass("disabled");
            }
          }
        },
        updateControls: function() {
          var base = this;
          base.updatePagination();
          base.checkNavigation();
          if (base.owlControls) {
            if (base.options.items >= base.itemsAmount) {
              base.owlControls.hide();
            } else {
              base.owlControls.show();
            }
          }
        },
        destroyControls: function() {
          var base = this;
          if (base.owlControls) {
            base.owlControls.remove();
          }
        },
        next: function(speed) {
          var base = this;
          if (base.isTransition) {
            return false;
          }
          base.currentItem += base.options.scrollPerPage === true ? base.options.items : 1;
          if (base.currentItem > base.maximumItem + (base.options.scrollPerPage === true ? (base.options.items - 1) : 0)) {
            if (base.options.rewindNav === true) {
              base.currentItem = 0;
              speed = "rewind";
            } else {
              base.currentItem = base.maximumItem;
              return false;
            }
          }
          base.goTo(base.currentItem, speed);
        },
        prev: function(speed) {
          var base = this;
          if (base.isTransition) {
            return false;
          }
          if (base.options.scrollPerPage === true && base.currentItem > 0 && base.currentItem < base.options.items) {
            base.currentItem = 0;
          } else {
            base.currentItem -= base.options.scrollPerPage === true ? base.options.items : 1;
          }
          if (base.currentItem < 0) {
            if (base.options.rewindNav === true) {
              base.currentItem = base.maximumItem;
              speed = "rewind";
            } else {
              base.currentItem = 0;
              return false;
            }
          }
          base.goTo(base.currentItem, speed);
        },
        goTo: function(position, speed, drag) {
          var base = this,
              goToPixel;
          if (base.isTransition) {
            return false;
          }
          if (typeof base.options.beforeMove === "function") {
            base.options.beforeMove.apply(this, [base.$elem]);
          }
          if (position >= base.maximumItem) {
            position = base.maximumItem;
          } else if (position <= 0) {
            position = 0;
          }
          base.currentItem = base.owl.currentItem = position;
          if (base.options.transitionStyle !== false && drag !== "drag" && base.options.items === 1 && base.browser.support3d === true) {
            base.swapSpeed(0);
            if (base.browser.support3d === true) {
              base.transition3d(base.positionsInArray[position]);
            } else {
              base.css2slide(base.positionsInArray[position], 1);
            }
            base.afterGo();
            base.singleItemTransition();
            return false;
          }
          goToPixel = base.positionsInArray[position];
          if (base.browser.support3d === true) {
            base.isCss3Finish = false;
            if (speed === true) {
              base.swapSpeed("paginationSpeed");
              window.setTimeout(function() {
                base.isCss3Finish = true;
              }, base.options.paginationSpeed);
            } else if (speed === "rewind") {
              base.swapSpeed(base.options.rewindSpeed);
              window.setTimeout(function() {
                base.isCss3Finish = true;
              }, base.options.rewindSpeed);
            } else {
              base.swapSpeed("slideSpeed");
              window.setTimeout(function() {
                base.isCss3Finish = true;
              }, base.options.slideSpeed);
            }
            base.transition3d(goToPixel);
          } else {
            if (speed === true) {
              base.css2slide(goToPixel, base.options.paginationSpeed);
            } else if (speed === "rewind") {
              base.css2slide(goToPixel, base.options.rewindSpeed);
            } else {
              base.css2slide(goToPixel, base.options.slideSpeed);
            }
          }
          base.afterGo();
        },
        jumpTo: function(position) {
          var base = this;
          if (typeof base.options.beforeMove === "function") {
            base.options.beforeMove.apply(this, [base.$elem]);
          }
          if (position >= base.maximumItem || position === -1) {
            position = base.maximumItem;
          } else if (position <= 0) {
            position = 0;
          }
          base.swapSpeed(0);
          if (base.browser.support3d === true) {
            base.transition3d(base.positionsInArray[position]);
          } else {
            base.css2slide(base.positionsInArray[position], 1);
          }
          base.currentItem = base.owl.currentItem = position;
          base.afterGo();
        },
        afterGo: function() {
          var base = this;
          base.prevArr.push(base.currentItem);
          base.prevItem = base.owl.prevItem = base.prevArr[base.prevArr.length - 2];
          base.prevArr.shift(0);
          if (base.prevItem !== base.currentItem) {
            base.checkPagination();
            base.checkNavigation();
            base.eachMoveUpdate();
            if (base.options.autoPlay !== false) {
              base.checkAp();
            }
          }
          if (typeof base.options.afterMove === "function" && base.prevItem !== base.currentItem) {
            base.options.afterMove.apply(this, [base.$elem]);
          }
        },
        stop: function() {
          var base = this;
          base.apStatus = "stop";
          window.clearInterval(base.autoPlayInterval);
        },
        checkAp: function() {
          var base = this;
          if (base.apStatus !== "stop") {
            base.play();
          }
        },
        play: function() {
          var base = this;
          base.apStatus = "play";
          if (base.options.autoPlay === false) {
            return false;
          }
          window.clearInterval(base.autoPlayInterval);
          base.autoPlayInterval = window.setInterval(function() {
            base.next(true);
          }, base.options.autoPlay);
        },
        swapSpeed: function(action) {
          var base = this;
          if (action === "slideSpeed") {
            base.$owlWrapper.css(base.addCssSpeed(base.options.slideSpeed));
          } else if (action === "paginationSpeed") {
            base.$owlWrapper.css(base.addCssSpeed(base.options.paginationSpeed));
          } else if (typeof action !== "string") {
            base.$owlWrapper.css(base.addCssSpeed(action));
          }
        },
        addCssSpeed: function(speed) {
          return {
            "-webkit-transition": "all " + speed + "ms ease",
            "-moz-transition": "all " + speed + "ms ease",
            "-o-transition": "all " + speed + "ms ease",
            "transition": "all " + speed + "ms ease"
          };
        },
        removeTransition: function() {
          return {
            "-webkit-transition": "",
            "-moz-transition": "",
            "-o-transition": "",
            "transition": ""
          };
        },
        doTranslate: function(pixels) {
          return {
            "-webkit-transform": "translate3d(" + pixels + "px, 0px, 0px)",
            "-moz-transform": "translate3d(" + pixels + "px, 0px, 0px)",
            "-o-transform": "translate3d(" + pixels + "px, 0px, 0px)",
            "-ms-transform": "translate3d(" + pixels + "px, 0px, 0px)",
            "transform": "translate3d(" + pixels + "px, 0px,0px)"
          };
        },
        transition3d: function(value) {
          var base = this;
          base.$owlWrapper.css(base.doTranslate(value));
        },
        css2move: function(value) {
          var base = this;
          base.$owlWrapper.css({"left": value});
        },
        css2slide: function(value, speed) {
          var base = this;
          base.isCssFinish = false;
          base.$owlWrapper.stop(true, true).animate({"left": value}, {
            duration: speed || base.options.slideSpeed,
            complete: function() {
              base.isCssFinish = true;
            }
          });
        },
        checkBrowser: function() {
          var base = this,
              translate3D = "translate3d(0px, 0px, 0px)",
              tempElem = document.createElement("div"),
              regex,
              asSupport,
              support3d,
              isTouch;
          tempElem.style.cssText = "  -moz-transform:" + translate3D + "; -ms-transform:" + translate3D + "; -o-transform:" + translate3D + "; -webkit-transform:" + translate3D + "; transform:" + translate3D;
          regex = /translate3d\(0px, 0px, 0px\)/g;
          asSupport = tempElem.style.cssText.match(regex);
          support3d = (asSupport !== null && asSupport.length === 1);
          isTouch = "ontouchstart" in window || window.navigator.msMaxTouchPoints;
          base.browser = {
            "support3d": support3d,
            "isTouch": isTouch
          };
        },
        moveEvents: function() {
          var base = this;
          if (base.options.mouseDrag !== false || base.options.touchDrag !== false) {
            base.gestures();
            base.disabledEvents();
          }
        },
        eventTypes: function() {
          var base = this,
              types = ["s", "e", "x"];
          base.ev_types = {};
          if (base.options.mouseDrag === true && base.options.touchDrag === true) {
            types = ["touchstart.owl mousedown.owl", "touchmove.owl mousemove.owl", "touchend.owl touchcancel.owl mouseup.owl"];
          } else if (base.options.mouseDrag === false && base.options.touchDrag === true) {
            types = ["touchstart.owl", "touchmove.owl", "touchend.owl touchcancel.owl"];
          } else if (base.options.mouseDrag === true && base.options.touchDrag === false) {
            types = ["mousedown.owl", "mousemove.owl", "mouseup.owl"];
          }
          base.ev_types.start = types[0];
          base.ev_types.move = types[1];
          base.ev_types.end = types[2];
        },
        disabledEvents: function() {
          var base = this;
          base.$elem.on("dragstart.owl", function(event) {
            event.preventDefault();
          });
          base.$elem.on("mousedown.disableTextSelect", function(e) {
            return $(e.target).is('input, textarea, select, option');
          });
        },
        gestures: function() {
          var base = this,
              locals = {
                offsetX: 0,
                offsetY: 0,
                baseElWidth: 0,
                relativePos: 0,
                position: null,
                minSwipe: null,
                maxSwipe: null,
                sliding: null,
                dargging: null,
                targetElement: null
              };
          base.isCssFinish = true;
          function getTouches(event) {
            if (event.touches !== undefined) {
              return {
                x: event.touches[0].pageX,
                y: event.touches[0].pageY
              };
            }
            if (event.touches === undefined) {
              if (event.pageX !== undefined) {
                return {
                  x: event.pageX,
                  y: event.pageY
                };
              }
              if (event.pageX === undefined) {
                return {
                  x: event.clientX,
                  y: event.clientY
                };
              }
            }
          }
          function swapEvents(type) {
            if (type === "on") {
              $(document).on(base.ev_types.move, dragMove);
              $(document).on(base.ev_types.end, dragEnd);
            } else if (type === "off") {
              $(document).off(base.ev_types.move);
              $(document).off(base.ev_types.end);
            }
          }
          function dragStart(event) {
            var ev = event.originalEvent || event || window.event,
                position;
            if (ev.which === 3) {
              return false;
            }
            if (base.itemsAmount <= base.options.items) {
              return;
            }
            if (base.isCssFinish === false && !base.options.dragBeforeAnimFinish) {
              return false;
            }
            if (base.isCss3Finish === false && !base.options.dragBeforeAnimFinish) {
              return false;
            }
            if (base.options.autoPlay !== false) {
              window.clearInterval(base.autoPlayInterval);
            }
            if (base.browser.isTouch !== true && !base.$owlWrapper.hasClass("grabbing")) {
              base.$owlWrapper.addClass("grabbing");
            }
            base.newPosX = 0;
            base.newRelativeX = 0;
            $(this).css(base.removeTransition());
            position = $(this).position();
            locals.relativePos = position.left;
            locals.offsetX = getTouches(ev).x - position.left;
            locals.offsetY = getTouches(ev).y - position.top;
            swapEvents("on");
            locals.sliding = false;
            locals.targetElement = ev.target || ev.srcElement;
          }
          function dragMove(event) {
            var ev = event.originalEvent || event || window.event,
                minSwipe,
                maxSwipe;
            base.newPosX = getTouches(ev).x - locals.offsetX;
            base.newPosY = getTouches(ev).y - locals.offsetY;
            base.newRelativeX = base.newPosX - locals.relativePos;
            if (typeof base.options.startDragging === "function" && locals.dragging !== true && base.newRelativeX !== 0) {
              locals.dragging = true;
              base.options.startDragging.apply(base, [base.$elem]);
            }
            if ((base.newRelativeX > 8 || base.newRelativeX < -8) && (base.browser.isTouch === true)) {
              if (ev.preventDefault !== undefined) {
                ev.preventDefault();
              } else {
                ev.returnValue = false;
              }
              locals.sliding = true;
            }
            if ((base.newPosY > 10 || base.newPosY < -10) && locals.sliding === false) {
              $(document).off("touchmove.owl");
            }
            minSwipe = function() {
              return base.newRelativeX / 5;
            };
            maxSwipe = function() {
              return base.maximumPixels + base.newRelativeX / 5;
            };
            base.newPosX = Math.max(Math.min(base.newPosX, minSwipe()), maxSwipe());
            if (base.browser.support3d === true) {
              base.transition3d(base.newPosX);
            } else {
              base.css2move(base.newPosX);
            }
          }
          function dragEnd(event) {
            var ev = event.originalEvent || event || window.event,
                newPosition,
                handlers,
                owlStopEvent;
            ev.target = ev.target || ev.srcElement;
            locals.dragging = false;
            if (base.browser.isTouch !== true) {
              base.$owlWrapper.removeClass("grabbing");
            }
            if (base.newRelativeX < 0) {
              base.dragDirection = base.owl.dragDirection = "left";
            } else {
              base.dragDirection = base.owl.dragDirection = "right";
            }
            if (base.newRelativeX !== 0) {
              newPosition = base.getNewPosition();
              base.goTo(newPosition, false, "drag");
              if (locals.targetElement === ev.target && base.browser.isTouch !== true) {
                $(ev.target).on("click.disable", function(ev) {
                  ev.stopImmediatePropagation();
                  ev.stopPropagation();
                  ev.preventDefault();
                  $(ev.target).off("click.disable");
                });
                handlers = $._data(ev.target, "events").click;
                owlStopEvent = handlers.pop();
                handlers.splice(0, 0, owlStopEvent);
              }
            }
            swapEvents("off");
          }
          base.$elem.on(base.ev_types.start, ".owl-wrapper", dragStart);
        },
        getNewPosition: function() {
          var base = this,
              newPosition = base.closestItem();
          if (newPosition > base.maximumItem) {
            base.currentItem = base.maximumItem;
            newPosition = base.maximumItem;
          } else if (base.newPosX >= 0) {
            newPosition = 0;
            base.currentItem = 0;
          }
          return newPosition;
        },
        closestItem: function() {
          var base = this,
              array = base.options.scrollPerPage === true ? base.pagesInArray : base.positionsInArray,
              goal = base.newPosX,
              closest = null;
          $.each(array, function(i, v) {
            if (goal - (base.itemWidth / 20) > array[i + 1] && goal - (base.itemWidth / 20) < v && base.moveDirection() === "left") {
              closest = v;
              if (base.options.scrollPerPage === true) {
                base.currentItem = $.inArray(closest, base.positionsInArray);
              } else {
                base.currentItem = i;
              }
            } else if (goal + (base.itemWidth / 20) < v && goal + (base.itemWidth / 20) > (array[i + 1] || array[i] - base.itemWidth) && base.moveDirection() === "right") {
              if (base.options.scrollPerPage === true) {
                closest = array[i + 1] || array[array.length - 1];
                base.currentItem = $.inArray(closest, base.positionsInArray);
              } else {
                closest = array[i + 1];
                base.currentItem = i + 1;
              }
            }
          });
          return base.currentItem;
        },
        moveDirection: function() {
          var base = this,
              direction;
          if (base.newRelativeX < 0) {
            direction = "right";
            base.playDirection = "next";
          } else {
            direction = "left";
            base.playDirection = "prev";
          }
          return direction;
        },
        customEvents: function() {
          var base = this;
          base.$elem.on("owl.next", function() {
            base.next();
          });
          base.$elem.on("owl.prev", function() {
            base.prev();
          });
          base.$elem.on("owl.play", function(event, speed) {
            base.options.autoPlay = speed;
            base.play();
            base.hoverStatus = "play";
          });
          base.$elem.on("owl.stop", function() {
            base.stop();
            base.hoverStatus = "stop";
          });
          base.$elem.on("owl.goTo", function(event, item) {
            base.goTo(item);
          });
          base.$elem.on("owl.jumpTo", function(event, item) {
            base.jumpTo(item);
          });
        },
        stopOnHover: function() {
          var base = this;
          if (base.options.stopOnHover === true && base.browser.isTouch !== true && base.options.autoPlay !== false) {
            base.$elem.on("mouseover", function() {
              base.stop();
            });
            base.$elem.on("mouseout", function() {
              if (base.hoverStatus !== "stop") {
                base.play();
              }
            });
          }
        },
        lazyLoad: function() {
          var base = this,
              i,
              $item,
              itemNumber,
              $lazyImg,
              follow;
          if (base.options.lazyLoad === false) {
            return false;
          }
          for (i = 0; i < base.itemsAmount; i += 1) {
            $item = $(base.$owlItems[i]);
            if ($item.data("owl-loaded") === "loaded") {
              continue;
            }
            itemNumber = $item.data("owl-item");
            $lazyImg = $item.find(".lazyOwl");
            if (typeof $lazyImg.data("src") !== "string") {
              $item.data("owl-loaded", "loaded");
              continue;
            }
            if ($item.data("owl-loaded") === undefined) {
              $lazyImg.hide();
              $item.addClass("loading").data("owl-loaded", "checked");
            }
            if (base.options.lazyFollow === true) {
              follow = itemNumber >= base.currentItem;
            } else {
              follow = true;
            }
            if (follow && itemNumber < base.currentItem + base.options.items && $lazyImg.length) {
              base.lazyPreload($item, $lazyImg);
            }
          }
        },
        lazyPreload: function($item, $lazyImg) {
          var base = this,
              iterations = 0,
              isBackgroundImg;
          if ($lazyImg.prop("tagName") === "DIV") {
            $lazyImg.css("background-image", "url(" + $lazyImg.data("src") + ")");
            isBackgroundImg = true;
          } else {
            $lazyImg[0].src = $lazyImg.data("src");
          }
          function showImage() {
            $item.data("owl-loaded", "loaded").removeClass("loading");
            $lazyImg.removeAttr("data-src");
            if (base.options.lazyEffect === "fade") {
              $lazyImg.fadeIn(400);
            } else {
              $lazyImg.show();
            }
            if (typeof base.options.afterLazyLoad === "function") {
              base.options.afterLazyLoad.apply(this, [base.$elem]);
            }
          }
          function checkLazyImage() {
            iterations += 1;
            if (base.completeImg($lazyImg.get(0)) || isBackgroundImg === true) {
              showImage();
            } else if (iterations <= 100) {
              window.setTimeout(checkLazyImage, 100);
            } else {
              showImage();
            }
          }
          checkLazyImage();
        },
        autoHeight: function() {
          var base = this,
              $currentimg = $(base.$owlItems[base.currentItem]).find("img"),
              iterations;
          function addHeight() {
            var $currentItem = $(base.$owlItems[base.currentItem]).height();
            base.wrapperOuter.css("height", $currentItem + "px");
            if (!base.wrapperOuter.hasClass("autoHeight")) {
              window.setTimeout(function() {
                base.wrapperOuter.addClass("autoHeight");
              }, 0);
            }
          }
          function checkImage() {
            iterations += 1;
            if (base.completeImg($currentimg.get(0))) {
              addHeight();
            } else if (iterations <= 100) {
              window.setTimeout(checkImage, 100);
            } else {
              base.wrapperOuter.css("height", "");
            }
          }
          if ($currentimg.get(0) !== undefined) {
            iterations = 0;
            checkImage();
          } else {
            addHeight();
          }
        },
        completeImg: function(img) {
          var naturalWidthType;
          if (!img.complete) {
            return false;
          }
          naturalWidthType = typeof img.naturalWidth;
          if (naturalWidthType !== "undefined" && img.naturalWidth === 0) {
            return false;
          }
          return true;
        },
        onVisibleItems: function() {
          var base = this,
              i;
          if (base.options.addClassActive === true) {
            base.$owlItems.removeClass("active");
          }
          base.visibleItems = [];
          for (i = base.currentItem; i < base.currentItem + base.options.items; i += 1) {
            base.visibleItems.push(i);
            if (base.options.addClassActive === true) {
              $(base.$owlItems[i]).addClass("active");
            }
          }
          base.owl.visibleItems = base.visibleItems;
        },
        transitionTypes: function(className) {
          var base = this;
          base.outClass = "owl-" + className + "-out";
          base.inClass = "owl-" + className + "-in";
        },
        singleItemTransition: function() {
          var base = this,
              outClass = base.outClass,
              inClass = base.inClass,
              $currentItem = base.$owlItems.eq(base.currentItem),
              $prevItem = base.$owlItems.eq(base.prevItem),
              prevPos = Math.abs(base.positionsInArray[base.currentItem]) + base.positionsInArray[base.prevItem],
              origin = Math.abs(base.positionsInArray[base.currentItem]) + base.itemWidth / 2,
              animEnd = 'webkitAnimationEnd oAnimationEnd MSAnimationEnd animationend';
          base.isTransition = true;
          base.$owlWrapper.addClass('owl-origin').css({
            "-webkit-transform-origin": origin + "px",
            "-moz-perspective-origin": origin + "px",
            "perspective-origin": origin + "px"
          });
          function transStyles(prevPos) {
            return {
              "position": "relative",
              "left": prevPos + "px"
            };
          }
          $prevItem.css(transStyles(prevPos, 10)).addClass(outClass).on(animEnd, function() {
            base.endPrev = true;
            $prevItem.off(animEnd);
            base.clearTransStyle($prevItem, outClass);
          });
          $currentItem.addClass(inClass).on(animEnd, function() {
            base.endCurrent = true;
            $currentItem.off(animEnd);
            base.clearTransStyle($currentItem, inClass);
          });
        },
        clearTransStyle: function(item, classToRemove) {
          var base = this;
          item.css({
            "position": "",
            "left": ""
          }).removeClass(classToRemove);
          if (base.endPrev && base.endCurrent) {
            base.$owlWrapper.removeClass('owl-origin');
            base.endPrev = false;
            base.endCurrent = false;
            base.isTransition = false;
          }
        },
        owlStatus: function() {
          var base = this;
          base.owl = {
            "userOptions": base.userOptions,
            "baseElement": base.$elem,
            "userItems": base.$userItems,
            "owlItems": base.$owlItems,
            "currentItem": base.currentItem,
            "prevItem": base.prevItem,
            "visibleItems": base.visibleItems,
            "isTouch": base.browser.isTouch,
            "browser": base.browser,
            "dragDirection": base.dragDirection
          };
        },
        clearEvents: function() {
          var base = this;
          base.$elem.off(".owl owl mousedown.disableTextSelect");
          $(document).off(".owl owl");
          $(window).off("resize", base.resizer);
        },
        unWrap: function() {
          var base = this;
          if (base.$elem.children().length !== 0) {
            base.$owlWrapper.unwrap();
            base.$userItems.unwrap().unwrap();
            if (base.owlControls) {
              base.owlControls.remove();
            }
          }
          base.clearEvents();
          base.$elem.attr("style", base.$elem.data("owl-originalStyles") || "").attr("class", base.$elem.data("owl-originalClasses"));
        },
        destroy: function() {
          var base = this;
          base.stop();
          window.clearInterval(base.checkVisible);
          base.unWrap();
          base.$elem.removeData();
        },
        reinit: function(newOptions) {
          var base = this,
              options = $.extend({}, base.userOptions, newOptions);
          base.unWrap();
          base.init(options, base.$elem);
        },
        addItem: function(htmlString, targetPosition) {
          var base = this,
              position;
          if (!htmlString) {
            return false;
          }
          if (base.$elem.children().length === 0) {
            base.$elem.append(htmlString);
            base.setVars();
            return false;
          }
          base.unWrap();
          if (targetPosition === undefined || targetPosition === -1) {
            position = -1;
          } else {
            position = targetPosition;
          }
          if (position >= base.$userItems.length || position === -1) {
            base.$userItems.eq(-1).after(htmlString);
          } else {
            base.$userItems.eq(position).before(htmlString);
          }
          base.setVars();
        },
        removeItem: function(targetPosition) {
          var base = this,
              position;
          if (base.$elem.children().length === 0) {
            return false;
          }
          if (targetPosition === undefined || targetPosition === -1) {
            position = -1;
          } else {
            position = targetPosition;
          }
          base.unWrap();
          base.$userItems.eq(position).remove();
          base.setVars();
        }
      };
      $.fn.owlCarousel = function(options) {
        return this.each(function() {
          if ($(this).data("owl-init") === true) {
            return false;
          }
          $(this).data("owl-init", true);
          var carousel = Object.create(Carousel);
          carousel.init(options, this);
          $.data(this, "owlCarousel", carousel);
        });
      };
      $.fn.owlCarousel.options = {
        items: 5,
        itemsCustom: false,
        itemsDesktop: [1199, 4],
        itemsDesktopSmall: [979, 3],
        itemsTablet: [768, 2],
        itemsTabletSmall: false,
        itemsMobile: [479, 1],
        singleItem: false,
        itemsScaleUp: false,
        slideSpeed: 200,
        paginationSpeed: 800,
        rewindSpeed: 1000,
        autoPlay: false,
        stopOnHover: false,
        navigation: false,
        navigationText: ["prev", "next"],
        rewindNav: true,
        scrollPerPage: false,
        pagination: true,
        paginationNumbers: false,
        responsive: true,
        responsiveRefreshRate: 200,
        responsiveBaseWidth: window,
        baseClass: "owl-carousel",
        theme: "owl-theme",
        lazyLoad: false,
        lazyFollow: true,
        lazyEffect: "fade",
        autoHeight: false,
        jsonPath: false,
        jsonSuccess: false,
        dragBeforeAnimFinish: true,
        mouseDrag: true,
        touchDrag: true,
        addClassActive: false,
        transitionStyle: false,
        beforeUpdate: false,
        afterUpdate: false,
        beforeInit: false,
        afterInit: false,
        beforeMove: false,
        afterMove: false,
        afterAction: false,
        startDragging: false,
        afterLazyLoad: false
      };
    }(jQuery, window, document));
  })();
  return _retrieveGlobal();
});

$__System.registerDynamic("1e", ["18"], false, function(__require, __exports, __module) {
  var _retrieveGlobal = $__System.get("@@global-helpers").prepareGlobal(__module.id, "$", null);
  (function() {
    "format global";
    "deps jquery";
    "exports $";
    if (typeof jQuery === 'undefined') {
      throw new Error('Bootstrap\'s JavaScript requires jQuery');
    }
    +function($) {
      'use strict';
      var version = $.fn.jquery.split(' ')[0].split('.');
      if ((version[0] < 2 && version[1] < 9) || (version[0] == 1 && version[1] == 9 && version[2] < 1)) {
        throw new Error('Bootstrap\'s JavaScript requires jQuery version 1.9.1 or higher');
      }
    }(jQuery);
    +function($) {
      'use strict';
      function transitionEnd() {
        var el = document.createElement('bootstrap');
        var transEndEventNames = {
          WebkitTransition: 'webkitTransitionEnd',
          MozTransition: 'transitionend',
          OTransition: 'oTransitionEnd otransitionend',
          transition: 'transitionend'
        };
        for (var name in transEndEventNames) {
          if (el.style[name] !== undefined) {
            return {end: transEndEventNames[name]};
          }
        }
        return false;
      }
      $.fn.emulateTransitionEnd = function(duration) {
        var called = false;
        var $el = this;
        $(this).one('bsTransitionEnd', function() {
          called = true;
        });
        var callback = function() {
          if (!called)
            $($el).trigger($.support.transition.end);
        };
        setTimeout(callback, duration);
        return this;
      };
      $(function() {
        $.support.transition = transitionEnd();
        if (!$.support.transition)
          return;
        $.event.special.bsTransitionEnd = {
          bindType: $.support.transition.end,
          delegateType: $.support.transition.end,
          handle: function(e) {
            if ($(e.target).is(this))
              return e.handleObj.handler.apply(this, arguments);
          }
        };
      });
    }(jQuery);
    +function($) {
      'use strict';
      var dismiss = '[data-dismiss="alert"]';
      var Alert = function(el) {
        $(el).on('click', dismiss, this.close);
      };
      Alert.VERSION = '3.3.5';
      Alert.TRANSITION_DURATION = 150;
      Alert.prototype.close = function(e) {
        var $this = $(this);
        var selector = $this.attr('data-target');
        if (!selector) {
          selector = $this.attr('href');
          selector = selector && selector.replace(/.*(?=#[^\s]*$)/, '');
        }
        var $parent = $(selector);
        if (e)
          e.preventDefault();
        if (!$parent.length) {
          $parent = $this.closest('.alert');
        }
        $parent.trigger(e = $.Event('close.bs.alert'));
        if (e.isDefaultPrevented())
          return;
        $parent.removeClass('in');
        function removeElement() {
          $parent.detach().trigger('closed.bs.alert').remove();
        }
        $.support.transition && $parent.hasClass('fade') ? $parent.one('bsTransitionEnd', removeElement).emulateTransitionEnd(Alert.TRANSITION_DURATION) : removeElement();
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.alert');
          if (!data)
            $this.data('bs.alert', (data = new Alert(this)));
          if (typeof option == 'string')
            data[option].call($this);
        });
      }
      var old = $.fn.alert;
      $.fn.alert = Plugin;
      $.fn.alert.Constructor = Alert;
      $.fn.alert.noConflict = function() {
        $.fn.alert = old;
        return this;
      };
      $(document).on('click.bs.alert.data-api', dismiss, Alert.prototype.close);
    }(jQuery);
    +function($) {
      'use strict';
      var Button = function(element, options) {
        this.$element = $(element);
        this.options = $.extend({}, Button.DEFAULTS, options);
        this.isLoading = false;
      };
      Button.VERSION = '3.3.5';
      Button.DEFAULTS = {loadingText: 'loading...'};
      Button.prototype.setState = function(state) {
        var d = 'disabled';
        var $el = this.$element;
        var val = $el.is('input') ? 'val' : 'html';
        var data = $el.data();
        state += 'Text';
        if (data.resetText == null)
          $el.data('resetText', $el[val]());
        setTimeout($.proxy(function() {
          $el[val](data[state] == null ? this.options[state] : data[state]);
          if (state == 'loadingText') {
            this.isLoading = true;
            $el.addClass(d).attr(d, d);
          } else if (this.isLoading) {
            this.isLoading = false;
            $el.removeClass(d).removeAttr(d);
          }
        }, this), 0);
      };
      Button.prototype.toggle = function() {
        var changed = true;
        var $parent = this.$element.closest('[data-toggle="buttons"]');
        if ($parent.length) {
          var $input = this.$element.find('input');
          if ($input.prop('type') == 'radio') {
            if ($input.prop('checked'))
              changed = false;
            $parent.find('.active').removeClass('active');
            this.$element.addClass('active');
          } else if ($input.prop('type') == 'checkbox') {
            if (($input.prop('checked')) !== this.$element.hasClass('active'))
              changed = false;
            this.$element.toggleClass('active');
          }
          $input.prop('checked', this.$element.hasClass('active'));
          if (changed)
            $input.trigger('change');
        } else {
          this.$element.attr('aria-pressed', !this.$element.hasClass('active'));
          this.$element.toggleClass('active');
        }
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.button');
          var options = typeof option == 'object' && option;
          if (!data)
            $this.data('bs.button', (data = new Button(this, options)));
          if (option == 'toggle')
            data.toggle();
          else if (option)
            data.setState(option);
        });
      }
      var old = $.fn.button;
      $.fn.button = Plugin;
      $.fn.button.Constructor = Button;
      $.fn.button.noConflict = function() {
        $.fn.button = old;
        return this;
      };
      $(document).on('click.bs.button.data-api', '[data-toggle^="button"]', function(e) {
        var $btn = $(e.target);
        if (!$btn.hasClass('btn'))
          $btn = $btn.closest('.btn');
        Plugin.call($btn, 'toggle');
        if (!($(e.target).is('input[type="radio"]') || $(e.target).is('input[type="checkbox"]')))
          e.preventDefault();
      }).on('focus.bs.button.data-api blur.bs.button.data-api', '[data-toggle^="button"]', function(e) {
        $(e.target).closest('.btn').toggleClass('focus', /^focus(in)?$/.test(e.type));
      });
    }(jQuery);
    +function($) {
      'use strict';
      var Carousel = function(element, options) {
        this.$element = $(element);
        this.$indicators = this.$element.find('.carousel-indicators');
        this.options = options;
        this.paused = null;
        this.sliding = null;
        this.interval = null;
        this.$active = null;
        this.$items = null;
        this.options.keyboard && this.$element.on('keydown.bs.carousel', $.proxy(this.keydown, this));
        this.options.pause == 'hover' && !('ontouchstart' in document.documentElement) && this.$element.on('mouseenter.bs.carousel', $.proxy(this.pause, this)).on('mouseleave.bs.carousel', $.proxy(this.cycle, this));
      };
      Carousel.VERSION = '3.3.5';
      Carousel.TRANSITION_DURATION = 600;
      Carousel.DEFAULTS = {
        interval: 5000,
        pause: 'hover',
        wrap: true,
        keyboard: true
      };
      Carousel.prototype.keydown = function(e) {
        if (/input|textarea/i.test(e.target.tagName))
          return;
        switch (e.which) {
          case 37:
            this.prev();
            break;
          case 39:
            this.next();
            break;
          default:
            return;
        }
        e.preventDefault();
      };
      Carousel.prototype.cycle = function(e) {
        e || (this.paused = false);
        this.interval && clearInterval(this.interval);
        this.options.interval && !this.paused && (this.interval = setInterval($.proxy(this.next, this), this.options.interval));
        return this;
      };
      Carousel.prototype.getItemIndex = function(item) {
        this.$items = item.parent().children('.item');
        return this.$items.index(item || this.$active);
      };
      Carousel.prototype.getItemForDirection = function(direction, active) {
        var activeIndex = this.getItemIndex(active);
        var willWrap = (direction == 'prev' && activeIndex === 0) || (direction == 'next' && activeIndex == (this.$items.length - 1));
        if (willWrap && !this.options.wrap)
          return active;
        var delta = direction == 'prev' ? -1 : 1;
        var itemIndex = (activeIndex + delta) % this.$items.length;
        return this.$items.eq(itemIndex);
      };
      Carousel.prototype.to = function(pos) {
        var that = this;
        var activeIndex = this.getItemIndex(this.$active = this.$element.find('.item.active'));
        if (pos > (this.$items.length - 1) || pos < 0)
          return;
        if (this.sliding)
          return this.$element.one('slid.bs.carousel', function() {
            that.to(pos);
          });
        if (activeIndex == pos)
          return this.pause().cycle();
        return this.slide(pos > activeIndex ? 'next' : 'prev', this.$items.eq(pos));
      };
      Carousel.prototype.pause = function(e) {
        e || (this.paused = true);
        if (this.$element.find('.next, .prev').length && $.support.transition) {
          this.$element.trigger($.support.transition.end);
          this.cycle(true);
        }
        this.interval = clearInterval(this.interval);
        return this;
      };
      Carousel.prototype.next = function() {
        if (this.sliding)
          return;
        return this.slide('next');
      };
      Carousel.prototype.prev = function() {
        if (this.sliding)
          return;
        return this.slide('prev');
      };
      Carousel.prototype.slide = function(type, next) {
        var $active = this.$element.find('.item.active');
        var $next = next || this.getItemForDirection(type, $active);
        var isCycling = this.interval;
        var direction = type == 'next' ? 'left' : 'right';
        var that = this;
        if ($next.hasClass('active'))
          return (this.sliding = false);
        var relatedTarget = $next[0];
        var slideEvent = $.Event('slide.bs.carousel', {
          relatedTarget: relatedTarget,
          direction: direction
        });
        this.$element.trigger(slideEvent);
        if (slideEvent.isDefaultPrevented())
          return;
        this.sliding = true;
        isCycling && this.pause();
        if (this.$indicators.length) {
          this.$indicators.find('.active').removeClass('active');
          var $nextIndicator = $(this.$indicators.children()[this.getItemIndex($next)]);
          $nextIndicator && $nextIndicator.addClass('active');
        }
        var slidEvent = $.Event('slid.bs.carousel', {
          relatedTarget: relatedTarget,
          direction: direction
        });
        if ($.support.transition && this.$element.hasClass('slide')) {
          $next.addClass(type);
          $next[0].offsetWidth;
          $active.addClass(direction);
          $next.addClass(direction);
          $active.one('bsTransitionEnd', function() {
            $next.removeClass([type, direction].join(' ')).addClass('active');
            $active.removeClass(['active', direction].join(' '));
            that.sliding = false;
            setTimeout(function() {
              that.$element.trigger(slidEvent);
            }, 0);
          }).emulateTransitionEnd(Carousel.TRANSITION_DURATION);
        } else {
          $active.removeClass('active');
          $next.addClass('active');
          this.sliding = false;
          this.$element.trigger(slidEvent);
        }
        isCycling && this.cycle();
        return this;
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.carousel');
          var options = $.extend({}, Carousel.DEFAULTS, $this.data(), typeof option == 'object' && option);
          var action = typeof option == 'string' ? option : options.slide;
          if (!data)
            $this.data('bs.carousel', (data = new Carousel(this, options)));
          if (typeof option == 'number')
            data.to(option);
          else if (action)
            data[action]();
          else if (options.interval)
            data.pause().cycle();
        });
      }
      var old = $.fn.carousel;
      $.fn.carousel = Plugin;
      $.fn.carousel.Constructor = Carousel;
      $.fn.carousel.noConflict = function() {
        $.fn.carousel = old;
        return this;
      };
      var clickHandler = function(e) {
        var href;
        var $this = $(this);
        var $target = $($this.attr('data-target') || (href = $this.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, ''));
        if (!$target.hasClass('carousel'))
          return;
        var options = $.extend({}, $target.data(), $this.data());
        var slideIndex = $this.attr('data-slide-to');
        if (slideIndex)
          options.interval = false;
        Plugin.call($target, options);
        if (slideIndex) {
          $target.data('bs.carousel').to(slideIndex);
        }
        e.preventDefault();
      };
      $(document).on('click.bs.carousel.data-api', '[data-slide]', clickHandler).on('click.bs.carousel.data-api', '[data-slide-to]', clickHandler);
      $(window).on('load', function() {
        $('[data-ride="carousel"]').each(function() {
          var $carousel = $(this);
          Plugin.call($carousel, $carousel.data());
        });
      });
    }(jQuery);
    +function($) {
      'use strict';
      var Collapse = function(element, options) {
        this.$element = $(element);
        this.options = $.extend({}, Collapse.DEFAULTS, options);
        this.$trigger = $('[data-toggle="collapse"][href="#' + element.id + '"],' + '[data-toggle="collapse"][data-target="#' + element.id + '"]');
        this.transitioning = null;
        if (this.options.parent) {
          this.$parent = this.getParent();
        } else {
          this.addAriaAndCollapsedClass(this.$element, this.$trigger);
        }
        if (this.options.toggle)
          this.toggle();
      };
      Collapse.VERSION = '3.3.5';
      Collapse.TRANSITION_DURATION = 350;
      Collapse.DEFAULTS = {toggle: true};
      Collapse.prototype.dimension = function() {
        var hasWidth = this.$element.hasClass('width');
        return hasWidth ? 'width' : 'height';
      };
      Collapse.prototype.show = function() {
        if (this.transitioning || this.$element.hasClass('in'))
          return;
        var activesData;
        var actives = this.$parent && this.$parent.children('.panel').children('.in, .collapsing');
        if (actives && actives.length) {
          activesData = actives.data('bs.collapse');
          if (activesData && activesData.transitioning)
            return;
        }
        var startEvent = $.Event('show.bs.collapse');
        this.$element.trigger(startEvent);
        if (startEvent.isDefaultPrevented())
          return;
        if (actives && actives.length) {
          Plugin.call(actives, 'hide');
          activesData || actives.data('bs.collapse', null);
        }
        var dimension = this.dimension();
        this.$element.removeClass('collapse').addClass('collapsing')[dimension](0).attr('aria-expanded', true);
        this.$trigger.removeClass('collapsed').attr('aria-expanded', true);
        this.transitioning = 1;
        var complete = function() {
          this.$element.removeClass('collapsing').addClass('collapse in')[dimension]('');
          this.transitioning = 0;
          this.$element.trigger('shown.bs.collapse');
        };
        if (!$.support.transition)
          return complete.call(this);
        var scrollSize = $.camelCase(['scroll', dimension].join('-'));
        this.$element.one('bsTransitionEnd', $.proxy(complete, this)).emulateTransitionEnd(Collapse.TRANSITION_DURATION)[dimension](this.$element[0][scrollSize]);
      };
      Collapse.prototype.hide = function() {
        if (this.transitioning || !this.$element.hasClass('in'))
          return;
        var startEvent = $.Event('hide.bs.collapse');
        this.$element.trigger(startEvent);
        if (startEvent.isDefaultPrevented())
          return;
        var dimension = this.dimension();
        this.$element[dimension](this.$element[dimension]())[0].offsetHeight;
        this.$element.addClass('collapsing').removeClass('collapse in').attr('aria-expanded', false);
        this.$trigger.addClass('collapsed').attr('aria-expanded', false);
        this.transitioning = 1;
        var complete = function() {
          this.transitioning = 0;
          this.$element.removeClass('collapsing').addClass('collapse').trigger('hidden.bs.collapse');
        };
        if (!$.support.transition)
          return complete.call(this);
        this.$element[dimension](0).one('bsTransitionEnd', $.proxy(complete, this)).emulateTransitionEnd(Collapse.TRANSITION_DURATION);
      };
      Collapse.prototype.toggle = function() {
        this[this.$element.hasClass('in') ? 'hide' : 'show']();
      };
      Collapse.prototype.getParent = function() {
        return $(this.options.parent).find('[data-toggle="collapse"][data-parent="' + this.options.parent + '"]').each($.proxy(function(i, element) {
          var $element = $(element);
          this.addAriaAndCollapsedClass(getTargetFromTrigger($element), $element);
        }, this)).end();
      };
      Collapse.prototype.addAriaAndCollapsedClass = function($element, $trigger) {
        var isOpen = $element.hasClass('in');
        $element.attr('aria-expanded', isOpen);
        $trigger.toggleClass('collapsed', !isOpen).attr('aria-expanded', isOpen);
      };
      function getTargetFromTrigger($trigger) {
        var href;
        var target = $trigger.attr('data-target') || (href = $trigger.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '');
        return $(target);
      }
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.collapse');
          var options = $.extend({}, Collapse.DEFAULTS, $this.data(), typeof option == 'object' && option);
          if (!data && options.toggle && /show|hide/.test(option))
            options.toggle = false;
          if (!data)
            $this.data('bs.collapse', (data = new Collapse(this, options)));
          if (typeof option == 'string')
            data[option]();
        });
      }
      var old = $.fn.collapse;
      $.fn.collapse = Plugin;
      $.fn.collapse.Constructor = Collapse;
      $.fn.collapse.noConflict = function() {
        $.fn.collapse = old;
        return this;
      };
      $(document).on('click.bs.collapse.data-api', '[data-toggle="collapse"]', function(e) {
        var $this = $(this);
        if (!$this.attr('data-target'))
          e.preventDefault();
        var $target = getTargetFromTrigger($this);
        var data = $target.data('bs.collapse');
        var option = data ? 'toggle' : $this.data();
        Plugin.call($target, option);
      });
    }(jQuery);
    +function($) {
      'use strict';
      var backdrop = '.dropdown-backdrop';
      var toggle = '[data-toggle="dropdown"]';
      var Dropdown = function(element) {
        $(element).on('click.bs.dropdown', this.toggle);
      };
      Dropdown.VERSION = '3.3.5';
      function getParent($this) {
        var selector = $this.attr('data-target');
        if (!selector) {
          selector = $this.attr('href');
          selector = selector && /#[A-Za-z]/.test(selector) && selector.replace(/.*(?=#[^\s]*$)/, '');
        }
        var $parent = selector && $(selector);
        return $parent && $parent.length ? $parent : $this.parent();
      }
      function clearMenus(e) {
        if (e && e.which === 3)
          return;
        $(backdrop).remove();
        $(toggle).each(function() {
          var $this = $(this);
          var $parent = getParent($this);
          var relatedTarget = {relatedTarget: this};
          if (!$parent.hasClass('open'))
            return;
          if (e && e.type == 'click' && /input|textarea/i.test(e.target.tagName) && $.contains($parent[0], e.target))
            return;
          $parent.trigger(e = $.Event('hide.bs.dropdown', relatedTarget));
          if (e.isDefaultPrevented())
            return;
          $this.attr('aria-expanded', 'false');
          $parent.removeClass('open').trigger('hidden.bs.dropdown', relatedTarget);
        });
      }
      Dropdown.prototype.toggle = function(e) {
        var $this = $(this);
        if ($this.is('.disabled, :disabled'))
          return;
        var $parent = getParent($this);
        var isActive = $parent.hasClass('open');
        clearMenus();
        if (!isActive) {
          if ('ontouchstart' in document.documentElement && !$parent.closest('.navbar-nav').length) {
            $(document.createElement('div')).addClass('dropdown-backdrop').insertAfter($(this)).on('click', clearMenus);
          }
          var relatedTarget = {relatedTarget: this};
          $parent.trigger(e = $.Event('show.bs.dropdown', relatedTarget));
          if (e.isDefaultPrevented())
            return;
          $this.trigger('focus').attr('aria-expanded', 'true');
          $parent.toggleClass('open').trigger('shown.bs.dropdown', relatedTarget);
        }
        return false;
      };
      Dropdown.prototype.keydown = function(e) {
        if (!/(38|40|27|32)/.test(e.which) || /input|textarea/i.test(e.target.tagName))
          return;
        var $this = $(this);
        e.preventDefault();
        e.stopPropagation();
        if ($this.is('.disabled, :disabled'))
          return;
        var $parent = getParent($this);
        var isActive = $parent.hasClass('open');
        if (!isActive && e.which != 27 || isActive && e.which == 27) {
          if (e.which == 27)
            $parent.find(toggle).trigger('focus');
          return $this.trigger('click');
        }
        var desc = ' li:not(.disabled):visible a';
        var $items = $parent.find('.dropdown-menu' + desc);
        if (!$items.length)
          return;
        var index = $items.index(e.target);
        if (e.which == 38 && index > 0)
          index--;
        if (e.which == 40 && index < $items.length - 1)
          index++;
        if (!~index)
          index = 0;
        $items.eq(index).trigger('focus');
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.dropdown');
          if (!data)
            $this.data('bs.dropdown', (data = new Dropdown(this)));
          if (typeof option == 'string')
            data[option].call($this);
        });
      }
      var old = $.fn.dropdown;
      $.fn.dropdown = Plugin;
      $.fn.dropdown.Constructor = Dropdown;
      $.fn.dropdown.noConflict = function() {
        $.fn.dropdown = old;
        return this;
      };
      $(document).on('click.bs.dropdown.data-api', clearMenus).on('click.bs.dropdown.data-api', '.dropdown form', function(e) {
        e.stopPropagation();
      }).on('click.bs.dropdown.data-api', toggle, Dropdown.prototype.toggle).on('keydown.bs.dropdown.data-api', toggle, Dropdown.prototype.keydown).on('keydown.bs.dropdown.data-api', '.dropdown-menu', Dropdown.prototype.keydown);
    }(jQuery);
    +function($) {
      'use strict';
      var Modal = function(element, options) {
        this.options = options;
        this.$body = $(document.body);
        this.$element = $(element);
        this.$dialog = this.$element.find('.modal-dialog');
        this.$backdrop = null;
        this.isShown = null;
        this.originalBodyPad = null;
        this.scrollbarWidth = 0;
        this.ignoreBackdropClick = false;
        if (this.options.remote) {
          this.$element.find('.modal-content').load(this.options.remote, $.proxy(function() {
            this.$element.trigger('loaded.bs.modal');
          }, this));
        }
      };
      Modal.VERSION = '3.3.5';
      Modal.TRANSITION_DURATION = 300;
      Modal.BACKDROP_TRANSITION_DURATION = 150;
      Modal.DEFAULTS = {
        backdrop: true,
        keyboard: true,
        show: true
      };
      Modal.prototype.toggle = function(_relatedTarget) {
        return this.isShown ? this.hide() : this.show(_relatedTarget);
      };
      Modal.prototype.show = function(_relatedTarget) {
        var that = this;
        var e = $.Event('show.bs.modal', {relatedTarget: _relatedTarget});
        this.$element.trigger(e);
        if (this.isShown || e.isDefaultPrevented())
          return;
        this.isShown = true;
        this.checkScrollbar();
        this.setScrollbar();
        this.$body.addClass('modal-open');
        this.escape();
        this.resize();
        this.$element.on('click.dismiss.bs.modal', '[data-dismiss="modal"]', $.proxy(this.hide, this));
        this.$dialog.on('mousedown.dismiss.bs.modal', function() {
          that.$element.one('mouseup.dismiss.bs.modal', function(e) {
            if ($(e.target).is(that.$element))
              that.ignoreBackdropClick = true;
          });
        });
        this.backdrop(function() {
          var transition = $.support.transition && that.$element.hasClass('fade');
          if (!that.$element.parent().length) {
            that.$element.appendTo(that.$body);
          }
          that.$element.show().scrollTop(0);
          that.adjustDialog();
          if (transition) {
            that.$element[0].offsetWidth;
          }
          that.$element.addClass('in');
          that.enforceFocus();
          var e = $.Event('shown.bs.modal', {relatedTarget: _relatedTarget});
          transition ? that.$dialog.one('bsTransitionEnd', function() {
            that.$element.trigger('focus').trigger(e);
          }).emulateTransitionEnd(Modal.TRANSITION_DURATION) : that.$element.trigger('focus').trigger(e);
        });
      };
      Modal.prototype.hide = function(e) {
        if (e)
          e.preventDefault();
        e = $.Event('hide.bs.modal');
        this.$element.trigger(e);
        if (!this.isShown || e.isDefaultPrevented())
          return;
        this.isShown = false;
        this.escape();
        this.resize();
        $(document).off('focusin.bs.modal');
        this.$element.removeClass('in').off('click.dismiss.bs.modal').off('mouseup.dismiss.bs.modal');
        this.$dialog.off('mousedown.dismiss.bs.modal');
        $.support.transition && this.$element.hasClass('fade') ? this.$element.one('bsTransitionEnd', $.proxy(this.hideModal, this)).emulateTransitionEnd(Modal.TRANSITION_DURATION) : this.hideModal();
      };
      Modal.prototype.enforceFocus = function() {
        $(document).off('focusin.bs.modal').on('focusin.bs.modal', $.proxy(function(e) {
          if (this.$element[0] !== e.target && !this.$element.has(e.target).length) {
            this.$element.trigger('focus');
          }
        }, this));
      };
      Modal.prototype.escape = function() {
        if (this.isShown && this.options.keyboard) {
          this.$element.on('keydown.dismiss.bs.modal', $.proxy(function(e) {
            e.which == 27 && this.hide();
          }, this));
        } else if (!this.isShown) {
          this.$element.off('keydown.dismiss.bs.modal');
        }
      };
      Modal.prototype.resize = function() {
        if (this.isShown) {
          $(window).on('resize.bs.modal', $.proxy(this.handleUpdate, this));
        } else {
          $(window).off('resize.bs.modal');
        }
      };
      Modal.prototype.hideModal = function() {
        var that = this;
        this.$element.hide();
        this.backdrop(function() {
          that.$body.removeClass('modal-open');
          that.resetAdjustments();
          that.resetScrollbar();
          that.$element.trigger('hidden.bs.modal');
        });
      };
      Modal.prototype.removeBackdrop = function() {
        this.$backdrop && this.$backdrop.remove();
        this.$backdrop = null;
      };
      Modal.prototype.backdrop = function(callback) {
        var that = this;
        var animate = this.$element.hasClass('fade') ? 'fade' : '';
        if (this.isShown && this.options.backdrop) {
          var doAnimate = $.support.transition && animate;
          this.$backdrop = $(document.createElement('div')).addClass('modal-backdrop ' + animate).appendTo(this.$body);
          this.$element.on('click.dismiss.bs.modal', $.proxy(function(e) {
            if (this.ignoreBackdropClick) {
              this.ignoreBackdropClick = false;
              return;
            }
            if (e.target !== e.currentTarget)
              return;
            this.options.backdrop == 'static' ? this.$element[0].focus() : this.hide();
          }, this));
          if (doAnimate)
            this.$backdrop[0].offsetWidth;
          this.$backdrop.addClass('in');
          if (!callback)
            return;
          doAnimate ? this.$backdrop.one('bsTransitionEnd', callback).emulateTransitionEnd(Modal.BACKDROP_TRANSITION_DURATION) : callback();
        } else if (!this.isShown && this.$backdrop) {
          this.$backdrop.removeClass('in');
          var callbackRemove = function() {
            that.removeBackdrop();
            callback && callback();
          };
          $.support.transition && this.$element.hasClass('fade') ? this.$backdrop.one('bsTransitionEnd', callbackRemove).emulateTransitionEnd(Modal.BACKDROP_TRANSITION_DURATION) : callbackRemove();
        } else if (callback) {
          callback();
        }
      };
      Modal.prototype.handleUpdate = function() {
        this.adjustDialog();
      };
      Modal.prototype.adjustDialog = function() {
        var modalIsOverflowing = this.$element[0].scrollHeight > document.documentElement.clientHeight;
        this.$element.css({
          paddingLeft: !this.bodyIsOverflowing && modalIsOverflowing ? this.scrollbarWidth : '',
          paddingRight: this.bodyIsOverflowing && !modalIsOverflowing ? this.scrollbarWidth : ''
        });
      };
      Modal.prototype.resetAdjustments = function() {
        this.$element.css({
          paddingLeft: '',
          paddingRight: ''
        });
      };
      Modal.prototype.checkScrollbar = function() {
        var fullWindowWidth = window.innerWidth;
        if (!fullWindowWidth) {
          var documentElementRect = document.documentElement.getBoundingClientRect();
          fullWindowWidth = documentElementRect.right - Math.abs(documentElementRect.left);
        }
        this.bodyIsOverflowing = document.body.clientWidth < fullWindowWidth;
        this.scrollbarWidth = this.measureScrollbar();
      };
      Modal.prototype.setScrollbar = function() {
        var bodyPad = parseInt((this.$body.css('padding-right') || 0), 10);
        this.originalBodyPad = document.body.style.paddingRight || '';
        if (this.bodyIsOverflowing)
          this.$body.css('padding-right', bodyPad + this.scrollbarWidth);
      };
      Modal.prototype.resetScrollbar = function() {
        this.$body.css('padding-right', this.originalBodyPad);
      };
      Modal.prototype.measureScrollbar = function() {
        var scrollDiv = document.createElement('div');
        scrollDiv.className = 'modal-scrollbar-measure';
        this.$body.append(scrollDiv);
        var scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
        this.$body[0].removeChild(scrollDiv);
        return scrollbarWidth;
      };
      function Plugin(option, _relatedTarget) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.modal');
          var options = $.extend({}, Modal.DEFAULTS, $this.data(), typeof option == 'object' && option);
          if (!data)
            $this.data('bs.modal', (data = new Modal(this, options)));
          if (typeof option == 'string')
            data[option](_relatedTarget);
          else if (options.show)
            data.show(_relatedTarget);
        });
      }
      var old = $.fn.modal;
      $.fn.modal = Plugin;
      $.fn.modal.Constructor = Modal;
      $.fn.modal.noConflict = function() {
        $.fn.modal = old;
        return this;
      };
      $(document).on('click.bs.modal.data-api', '[data-toggle="modal"]', function(e) {
        var $this = $(this);
        var href = $this.attr('href');
        var $target = $($this.attr('data-target') || (href && href.replace(/.*(?=#[^\s]+$)/, '')));
        var option = $target.data('bs.modal') ? 'toggle' : $.extend({remote: !/#/.test(href) && href}, $target.data(), $this.data());
        if ($this.is('a'))
          e.preventDefault();
        $target.one('show.bs.modal', function(showEvent) {
          if (showEvent.isDefaultPrevented())
            return;
          $target.one('hidden.bs.modal', function() {
            $this.is(':visible') && $this.trigger('focus');
          });
        });
        Plugin.call($target, option, this);
      });
    }(jQuery);
    +function($) {
      'use strict';
      var Tooltip = function(element, options) {
        this.type = null;
        this.options = null;
        this.enabled = null;
        this.timeout = null;
        this.hoverState = null;
        this.$element = null;
        this.inState = null;
        this.init('tooltip', element, options);
      };
      Tooltip.VERSION = '3.3.5';
      Tooltip.TRANSITION_DURATION = 150;
      Tooltip.DEFAULTS = {
        animation: true,
        placement: 'top',
        selector: false,
        template: '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',
        trigger: 'hover focus',
        title: '',
        delay: 0,
        html: false,
        container: false,
        viewport: {
          selector: 'body',
          padding: 0
        }
      };
      Tooltip.prototype.init = function(type, element, options) {
        this.enabled = true;
        this.type = type;
        this.$element = $(element);
        this.options = this.getOptions(options);
        this.$viewport = this.options.viewport && $($.isFunction(this.options.viewport) ? this.options.viewport.call(this, this.$element) : (this.options.viewport.selector || this.options.viewport));
        this.inState = {
          click: false,
          hover: false,
          focus: false
        };
        if (this.$element[0] instanceof document.constructor && !this.options.selector) {
          throw new Error('`selector` option must be specified when initializing ' + this.type + ' on the window.document object!');
        }
        var triggers = this.options.trigger.split(' ');
        for (var i = triggers.length; i--; ) {
          var trigger = triggers[i];
          if (trigger == 'click') {
            this.$element.on('click.' + this.type, this.options.selector, $.proxy(this.toggle, this));
          } else if (trigger != 'manual') {
            var eventIn = trigger == 'hover' ? 'mouseenter' : 'focusin';
            var eventOut = trigger == 'hover' ? 'mouseleave' : 'focusout';
            this.$element.on(eventIn + '.' + this.type, this.options.selector, $.proxy(this.enter, this));
            this.$element.on(eventOut + '.' + this.type, this.options.selector, $.proxy(this.leave, this));
          }
        }
        this.options.selector ? (this._options = $.extend({}, this.options, {
          trigger: 'manual',
          selector: ''
        })) : this.fixTitle();
      };
      Tooltip.prototype.getDefaults = function() {
        return Tooltip.DEFAULTS;
      };
      Tooltip.prototype.getOptions = function(options) {
        options = $.extend({}, this.getDefaults(), this.$element.data(), options);
        if (options.delay && typeof options.delay == 'number') {
          options.delay = {
            show: options.delay,
            hide: options.delay
          };
        }
        return options;
      };
      Tooltip.prototype.getDelegateOptions = function() {
        var options = {};
        var defaults = this.getDefaults();
        this._options && $.each(this._options, function(key, value) {
          if (defaults[key] != value)
            options[key] = value;
        });
        return options;
      };
      Tooltip.prototype.enter = function(obj) {
        var self = obj instanceof this.constructor ? obj : $(obj.currentTarget).data('bs.' + this.type);
        if (!self) {
          self = new this.constructor(obj.currentTarget, this.getDelegateOptions());
          $(obj.currentTarget).data('bs.' + this.type, self);
        }
        if (obj instanceof $.Event) {
          self.inState[obj.type == 'focusin' ? 'focus' : 'hover'] = true;
        }
        if (self.tip().hasClass('in') || self.hoverState == 'in') {
          self.hoverState = 'in';
          return;
        }
        clearTimeout(self.timeout);
        self.hoverState = 'in';
        if (!self.options.delay || !self.options.delay.show)
          return self.show();
        self.timeout = setTimeout(function() {
          if (self.hoverState == 'in')
            self.show();
        }, self.options.delay.show);
      };
      Tooltip.prototype.isInStateTrue = function() {
        for (var key in this.inState) {
          if (this.inState[key])
            return true;
        }
        return false;
      };
      Tooltip.prototype.leave = function(obj) {
        var self = obj instanceof this.constructor ? obj : $(obj.currentTarget).data('bs.' + this.type);
        if (!self) {
          self = new this.constructor(obj.currentTarget, this.getDelegateOptions());
          $(obj.currentTarget).data('bs.' + this.type, self);
        }
        if (obj instanceof $.Event) {
          self.inState[obj.type == 'focusout' ? 'focus' : 'hover'] = false;
        }
        if (self.isInStateTrue())
          return;
        clearTimeout(self.timeout);
        self.hoverState = 'out';
        if (!self.options.delay || !self.options.delay.hide)
          return self.hide();
        self.timeout = setTimeout(function() {
          if (self.hoverState == 'out')
            self.hide();
        }, self.options.delay.hide);
      };
      Tooltip.prototype.show = function() {
        var e = $.Event('show.bs.' + this.type);
        if (this.hasContent() && this.enabled) {
          this.$element.trigger(e);
          var inDom = $.contains(this.$element[0].ownerDocument.documentElement, this.$element[0]);
          if (e.isDefaultPrevented() || !inDom)
            return;
          var that = this;
          var $tip = this.tip();
          var tipId = this.getUID(this.type);
          this.setContent();
          $tip.attr('id', tipId);
          this.$element.attr('aria-describedby', tipId);
          if (this.options.animation)
            $tip.addClass('fade');
          var placement = typeof this.options.placement == 'function' ? this.options.placement.call(this, $tip[0], this.$element[0]) : this.options.placement;
          var autoToken = /\s?auto?\s?/i;
          var autoPlace = autoToken.test(placement);
          if (autoPlace)
            placement = placement.replace(autoToken, '') || 'top';
          $tip.detach().css({
            top: 0,
            left: 0,
            display: 'block'
          }).addClass(placement).data('bs.' + this.type, this);
          this.options.container ? $tip.appendTo(this.options.container) : $tip.insertAfter(this.$element);
          this.$element.trigger('inserted.bs.' + this.type);
          var pos = this.getPosition();
          var actualWidth = $tip[0].offsetWidth;
          var actualHeight = $tip[0].offsetHeight;
          if (autoPlace) {
            var orgPlacement = placement;
            var viewportDim = this.getPosition(this.$viewport);
            placement = placement == 'bottom' && pos.bottom + actualHeight > viewportDim.bottom ? 'top' : placement == 'top' && pos.top - actualHeight < viewportDim.top ? 'bottom' : placement == 'right' && pos.right + actualWidth > viewportDim.width ? 'left' : placement == 'left' && pos.left - actualWidth < viewportDim.left ? 'right' : placement;
            $tip.removeClass(orgPlacement).addClass(placement);
          }
          var calculatedOffset = this.getCalculatedOffset(placement, pos, actualWidth, actualHeight);
          this.applyPlacement(calculatedOffset, placement);
          var complete = function() {
            var prevHoverState = that.hoverState;
            that.$element.trigger('shown.bs.' + that.type);
            that.hoverState = null;
            if (prevHoverState == 'out')
              that.leave(that);
          };
          $.support.transition && this.$tip.hasClass('fade') ? $tip.one('bsTransitionEnd', complete).emulateTransitionEnd(Tooltip.TRANSITION_DURATION) : complete();
        }
      };
      Tooltip.prototype.applyPlacement = function(offset, placement) {
        var $tip = this.tip();
        var width = $tip[0].offsetWidth;
        var height = $tip[0].offsetHeight;
        var marginTop = parseInt($tip.css('margin-top'), 10);
        var marginLeft = parseInt($tip.css('margin-left'), 10);
        if (isNaN(marginTop))
          marginTop = 0;
        if (isNaN(marginLeft))
          marginLeft = 0;
        offset.top += marginTop;
        offset.left += marginLeft;
        $.offset.setOffset($tip[0], $.extend({using: function(props) {
            $tip.css({
              top: Math.round(props.top),
              left: Math.round(props.left)
            });
          }}, offset), 0);
        $tip.addClass('in');
        var actualWidth = $tip[0].offsetWidth;
        var actualHeight = $tip[0].offsetHeight;
        if (placement == 'top' && actualHeight != height) {
          offset.top = offset.top + height - actualHeight;
        }
        var delta = this.getViewportAdjustedDelta(placement, offset, actualWidth, actualHeight);
        if (delta.left)
          offset.left += delta.left;
        else
          offset.top += delta.top;
        var isVertical = /top|bottom/.test(placement);
        var arrowDelta = isVertical ? delta.left * 2 - width + actualWidth : delta.top * 2 - height + actualHeight;
        var arrowOffsetPosition = isVertical ? 'offsetWidth' : 'offsetHeight';
        $tip.offset(offset);
        this.replaceArrow(arrowDelta, $tip[0][arrowOffsetPosition], isVertical);
      };
      Tooltip.prototype.replaceArrow = function(delta, dimension, isVertical) {
        this.arrow().css(isVertical ? 'left' : 'top', 50 * (1 - delta / dimension) + '%').css(isVertical ? 'top' : 'left', '');
      };
      Tooltip.prototype.setContent = function() {
        var $tip = this.tip();
        var title = this.getTitle();
        $tip.find('.tooltip-inner')[this.options.html ? 'html' : 'text'](title);
        $tip.removeClass('fade in top bottom left right');
      };
      Tooltip.prototype.hide = function(callback) {
        var that = this;
        var $tip = $(this.$tip);
        var e = $.Event('hide.bs.' + this.type);
        function complete() {
          if (that.hoverState != 'in')
            $tip.detach();
          that.$element.removeAttr('aria-describedby').trigger('hidden.bs.' + that.type);
          callback && callback();
        }
        this.$element.trigger(e);
        if (e.isDefaultPrevented())
          return;
        $tip.removeClass('in');
        $.support.transition && $tip.hasClass('fade') ? $tip.one('bsTransitionEnd', complete).emulateTransitionEnd(Tooltip.TRANSITION_DURATION) : complete();
        this.hoverState = null;
        return this;
      };
      Tooltip.prototype.fixTitle = function() {
        var $e = this.$element;
        if ($e.attr('title') || typeof $e.attr('data-original-title') != 'string') {
          $e.attr('data-original-title', $e.attr('title') || '').attr('title', '');
        }
      };
      Tooltip.prototype.hasContent = function() {
        return this.getTitle();
      };
      Tooltip.prototype.getPosition = function($element) {
        $element = $element || this.$element;
        var el = $element[0];
        var isBody = el.tagName == 'BODY';
        var elRect = el.getBoundingClientRect();
        if (elRect.width == null) {
          elRect = $.extend({}, elRect, {
            width: elRect.right - elRect.left,
            height: elRect.bottom - elRect.top
          });
        }
        var elOffset = isBody ? {
          top: 0,
          left: 0
        } : $element.offset();
        var scroll = {scroll: isBody ? document.documentElement.scrollTop || document.body.scrollTop : $element.scrollTop()};
        var outerDims = isBody ? {
          width: $(window).width(),
          height: $(window).height()
        } : null;
        return $.extend({}, elRect, scroll, outerDims, elOffset);
      };
      Tooltip.prototype.getCalculatedOffset = function(placement, pos, actualWidth, actualHeight) {
        return placement == 'bottom' ? {
          top: pos.top + pos.height,
          left: pos.left + pos.width / 2 - actualWidth / 2
        } : placement == 'top' ? {
          top: pos.top - actualHeight,
          left: pos.left + pos.width / 2 - actualWidth / 2
        } : placement == 'left' ? {
          top: pos.top + pos.height / 2 - actualHeight / 2,
          left: pos.left - actualWidth
        } : {
          top: pos.top + pos.height / 2 - actualHeight / 2,
          left: pos.left + pos.width
        };
      };
      Tooltip.prototype.getViewportAdjustedDelta = function(placement, pos, actualWidth, actualHeight) {
        var delta = {
          top: 0,
          left: 0
        };
        if (!this.$viewport)
          return delta;
        var viewportPadding = this.options.viewport && this.options.viewport.padding || 0;
        var viewportDimensions = this.getPosition(this.$viewport);
        if (/right|left/.test(placement)) {
          var topEdgeOffset = pos.top - viewportPadding - viewportDimensions.scroll;
          var bottomEdgeOffset = pos.top + viewportPadding - viewportDimensions.scroll + actualHeight;
          if (topEdgeOffset < viewportDimensions.top) {
            delta.top = viewportDimensions.top - topEdgeOffset;
          } else if (bottomEdgeOffset > viewportDimensions.top + viewportDimensions.height) {
            delta.top = viewportDimensions.top + viewportDimensions.height - bottomEdgeOffset;
          }
        } else {
          var leftEdgeOffset = pos.left - viewportPadding;
          var rightEdgeOffset = pos.left + viewportPadding + actualWidth;
          if (leftEdgeOffset < viewportDimensions.left) {
            delta.left = viewportDimensions.left - leftEdgeOffset;
          } else if (rightEdgeOffset > viewportDimensions.right) {
            delta.left = viewportDimensions.left + viewportDimensions.width - rightEdgeOffset;
          }
        }
        return delta;
      };
      Tooltip.prototype.getTitle = function() {
        var title;
        var $e = this.$element;
        var o = this.options;
        title = $e.attr('data-original-title') || (typeof o.title == 'function' ? o.title.call($e[0]) : o.title);
        return title;
      };
      Tooltip.prototype.getUID = function(prefix) {
        do
          prefix += ~~(Math.random() * 1000000);
 while (document.getElementById(prefix));
        return prefix;
      };
      Tooltip.prototype.tip = function() {
        if (!this.$tip) {
          this.$tip = $(this.options.template);
          if (this.$tip.length != 1) {
            throw new Error(this.type + ' `template` option must consist of exactly 1 top-level element!');
          }
        }
        return this.$tip;
      };
      Tooltip.prototype.arrow = function() {
        return (this.$arrow = this.$arrow || this.tip().find('.tooltip-arrow'));
      };
      Tooltip.prototype.enable = function() {
        this.enabled = true;
      };
      Tooltip.prototype.disable = function() {
        this.enabled = false;
      };
      Tooltip.prototype.toggleEnabled = function() {
        this.enabled = !this.enabled;
      };
      Tooltip.prototype.toggle = function(e) {
        var self = this;
        if (e) {
          self = $(e.currentTarget).data('bs.' + this.type);
          if (!self) {
            self = new this.constructor(e.currentTarget, this.getDelegateOptions());
            $(e.currentTarget).data('bs.' + this.type, self);
          }
        }
        if (e) {
          self.inState.click = !self.inState.click;
          if (self.isInStateTrue())
            self.enter(self);
          else
            self.leave(self);
        } else {
          self.tip().hasClass('in') ? self.leave(self) : self.enter(self);
        }
      };
      Tooltip.prototype.destroy = function() {
        var that = this;
        clearTimeout(this.timeout);
        this.hide(function() {
          that.$element.off('.' + that.type).removeData('bs.' + that.type);
          if (that.$tip) {
            that.$tip.detach();
          }
          that.$tip = null;
          that.$arrow = null;
          that.$viewport = null;
        });
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.tooltip');
          var options = typeof option == 'object' && option;
          if (!data && /destroy|hide/.test(option))
            return;
          if (!data)
            $this.data('bs.tooltip', (data = new Tooltip(this, options)));
          if (typeof option == 'string')
            data[option]();
        });
      }
      var old = $.fn.tooltip;
      $.fn.tooltip = Plugin;
      $.fn.tooltip.Constructor = Tooltip;
      $.fn.tooltip.noConflict = function() {
        $.fn.tooltip = old;
        return this;
      };
    }(jQuery);
    +function($) {
      'use strict';
      var Popover = function(element, options) {
        this.init('popover', element, options);
      };
      if (!$.fn.tooltip)
        throw new Error('Popover requires tooltip.js');
      Popover.VERSION = '3.3.5';
      Popover.DEFAULTS = $.extend({}, $.fn.tooltip.Constructor.DEFAULTS, {
        placement: 'right',
        trigger: 'click',
        content: '',
        template: '<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
      });
      Popover.prototype = $.extend({}, $.fn.tooltip.Constructor.prototype);
      Popover.prototype.constructor = Popover;
      Popover.prototype.getDefaults = function() {
        return Popover.DEFAULTS;
      };
      Popover.prototype.setContent = function() {
        var $tip = this.tip();
        var title = this.getTitle();
        var content = this.getContent();
        $tip.find('.popover-title')[this.options.html ? 'html' : 'text'](title);
        $tip.find('.popover-content').children().detach().end()[this.options.html ? (typeof content == 'string' ? 'html' : 'append') : 'text'](content);
        $tip.removeClass('fade top bottom left right in');
        if (!$tip.find('.popover-title').html())
          $tip.find('.popover-title').hide();
      };
      Popover.prototype.hasContent = function() {
        return this.getTitle() || this.getContent();
      };
      Popover.prototype.getContent = function() {
        var $e = this.$element;
        var o = this.options;
        return $e.attr('data-content') || (typeof o.content == 'function' ? o.content.call($e[0]) : o.content);
      };
      Popover.prototype.arrow = function() {
        return (this.$arrow = this.$arrow || this.tip().find('.arrow'));
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.popover');
          var options = typeof option == 'object' && option;
          if (!data && /destroy|hide/.test(option))
            return;
          if (!data)
            $this.data('bs.popover', (data = new Popover(this, options)));
          if (typeof option == 'string')
            data[option]();
        });
      }
      var old = $.fn.popover;
      $.fn.popover = Plugin;
      $.fn.popover.Constructor = Popover;
      $.fn.popover.noConflict = function() {
        $.fn.popover = old;
        return this;
      };
    }(jQuery);
    +function($) {
      'use strict';
      function ScrollSpy(element, options) {
        this.$body = $(document.body);
        this.$scrollElement = $(element).is(document.body) ? $(window) : $(element);
        this.options = $.extend({}, ScrollSpy.DEFAULTS, options);
        this.selector = (this.options.target || '') + ' .nav li > a';
        this.offsets = [];
        this.targets = [];
        this.activeTarget = null;
        this.scrollHeight = 0;
        this.$scrollElement.on('scroll.bs.scrollspy', $.proxy(this.process, this));
        this.refresh();
        this.process();
      }
      ScrollSpy.VERSION = '3.3.5';
      ScrollSpy.DEFAULTS = {offset: 10};
      ScrollSpy.prototype.getScrollHeight = function() {
        return this.$scrollElement[0].scrollHeight || Math.max(this.$body[0].scrollHeight, document.documentElement.scrollHeight);
      };
      ScrollSpy.prototype.refresh = function() {
        var that = this;
        var offsetMethod = 'offset';
        var offsetBase = 0;
        this.offsets = [];
        this.targets = [];
        this.scrollHeight = this.getScrollHeight();
        if (!$.isWindow(this.$scrollElement[0])) {
          offsetMethod = 'position';
          offsetBase = this.$scrollElement.scrollTop();
        }
        this.$body.find(this.selector).map(function() {
          var $el = $(this);
          var href = $el.data('target') || $el.attr('href');
          var $href = /^#./.test(href) && $(href);
          return ($href && $href.length && $href.is(':visible') && [[$href[offsetMethod]().top + offsetBase, href]]) || null;
        }).sort(function(a, b) {
          return a[0] - b[0];
        }).each(function() {
          that.offsets.push(this[0]);
          that.targets.push(this[1]);
        });
      };
      ScrollSpy.prototype.process = function() {
        var scrollTop = this.$scrollElement.scrollTop() + this.options.offset;
        var scrollHeight = this.getScrollHeight();
        var maxScroll = this.options.offset + scrollHeight - this.$scrollElement.height();
        var offsets = this.offsets;
        var targets = this.targets;
        var activeTarget = this.activeTarget;
        var i;
        if (this.scrollHeight != scrollHeight) {
          this.refresh();
        }
        if (scrollTop >= maxScroll) {
          return activeTarget != (i = targets[targets.length - 1]) && this.activate(i);
        }
        if (activeTarget && scrollTop < offsets[0]) {
          this.activeTarget = null;
          return this.clear();
        }
        for (i = offsets.length; i--; ) {
          activeTarget != targets[i] && scrollTop >= offsets[i] && (offsets[i + 1] === undefined || scrollTop < offsets[i + 1]) && this.activate(targets[i]);
        }
      };
      ScrollSpy.prototype.activate = function(target) {
        this.activeTarget = target;
        this.clear();
        var selector = this.selector + '[data-target="' + target + '"],' + this.selector + '[href="' + target + '"]';
        var active = $(selector).parents('li').addClass('active');
        if (active.parent('.dropdown-menu').length) {
          active = active.closest('li.dropdown').addClass('active');
        }
        active.trigger('activate.bs.scrollspy');
      };
      ScrollSpy.prototype.clear = function() {
        $(this.selector).parentsUntil(this.options.target, '.active').removeClass('active');
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.scrollspy');
          var options = typeof option == 'object' && option;
          if (!data)
            $this.data('bs.scrollspy', (data = new ScrollSpy(this, options)));
          if (typeof option == 'string')
            data[option]();
        });
      }
      var old = $.fn.scrollspy;
      $.fn.scrollspy = Plugin;
      $.fn.scrollspy.Constructor = ScrollSpy;
      $.fn.scrollspy.noConflict = function() {
        $.fn.scrollspy = old;
        return this;
      };
      $(window).on('load.bs.scrollspy.data-api', function() {
        $('[data-spy="scroll"]').each(function() {
          var $spy = $(this);
          Plugin.call($spy, $spy.data());
        });
      });
    }(jQuery);
    +function($) {
      'use strict';
      var Tab = function(element) {
        this.element = $(element);
      };
      Tab.VERSION = '3.3.5';
      Tab.TRANSITION_DURATION = 150;
      Tab.prototype.show = function() {
        var $this = this.element;
        var $ul = $this.closest('ul:not(.dropdown-menu)');
        var selector = $this.data('target');
        if (!selector) {
          selector = $this.attr('href');
          selector = selector && selector.replace(/.*(?=#[^\s]*$)/, '');
        }
        if ($this.parent('li').hasClass('active'))
          return;
        var $previous = $ul.find('.active:last a');
        var hideEvent = $.Event('hide.bs.tab', {relatedTarget: $this[0]});
        var showEvent = $.Event('show.bs.tab', {relatedTarget: $previous[0]});
        $previous.trigger(hideEvent);
        $this.trigger(showEvent);
        if (showEvent.isDefaultPrevented() || hideEvent.isDefaultPrevented())
          return;
        var $target = $(selector);
        this.activate($this.closest('li'), $ul);
        this.activate($target, $target.parent(), function() {
          $previous.trigger({
            type: 'hidden.bs.tab',
            relatedTarget: $this[0]
          });
          $this.trigger({
            type: 'shown.bs.tab',
            relatedTarget: $previous[0]
          });
        });
      };
      Tab.prototype.activate = function(element, container, callback) {
        var $active = container.find('> .active');
        var transition = callback && $.support.transition && ($active.length && $active.hasClass('fade') || !!container.find('> .fade').length);
        function next() {
          $active.removeClass('active').find('> .dropdown-menu > .active').removeClass('active').end().find('[data-toggle="tab"]').attr('aria-expanded', false);
          element.addClass('active').find('[data-toggle="tab"]').attr('aria-expanded', true);
          if (transition) {
            element[0].offsetWidth;
            element.addClass('in');
          } else {
            element.removeClass('fade');
          }
          if (element.parent('.dropdown-menu').length) {
            element.closest('li.dropdown').addClass('active').end().find('[data-toggle="tab"]').attr('aria-expanded', true);
          }
          callback && callback();
        }
        $active.length && transition ? $active.one('bsTransitionEnd', next).emulateTransitionEnd(Tab.TRANSITION_DURATION) : next();
        $active.removeClass('in');
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.tab');
          if (!data)
            $this.data('bs.tab', (data = new Tab(this)));
          if (typeof option == 'string')
            data[option]();
        });
      }
      var old = $.fn.tab;
      $.fn.tab = Plugin;
      $.fn.tab.Constructor = Tab;
      $.fn.tab.noConflict = function() {
        $.fn.tab = old;
        return this;
      };
      var clickHandler = function(e) {
        e.preventDefault();
        Plugin.call($(this), 'show');
      };
      $(document).on('click.bs.tab.data-api', '[data-toggle="tab"]', clickHandler).on('click.bs.tab.data-api', '[data-toggle="pill"]', clickHandler);
    }(jQuery);
    +function($) {
      'use strict';
      var Affix = function(element, options) {
        this.options = $.extend({}, Affix.DEFAULTS, options);
        this.$target = $(this.options.target).on('scroll.bs.affix.data-api', $.proxy(this.checkPosition, this)).on('click.bs.affix.data-api', $.proxy(this.checkPositionWithEventLoop, this));
        this.$element = $(element);
        this.affixed = null;
        this.unpin = null;
        this.pinnedOffset = null;
        this.checkPosition();
      };
      Affix.VERSION = '3.3.5';
      Affix.RESET = 'affix affix-top affix-bottom';
      Affix.DEFAULTS = {
        offset: 0,
        target: window
      };
      Affix.prototype.getState = function(scrollHeight, height, offsetTop, offsetBottom) {
        var scrollTop = this.$target.scrollTop();
        var position = this.$element.offset();
        var targetHeight = this.$target.height();
        if (offsetTop != null && this.affixed == 'top')
          return scrollTop < offsetTop ? 'top' : false;
        if (this.affixed == 'bottom') {
          if (offsetTop != null)
            return (scrollTop + this.unpin <= position.top) ? false : 'bottom';
          return (scrollTop + targetHeight <= scrollHeight - offsetBottom) ? false : 'bottom';
        }
        var initializing = this.affixed == null;
        var colliderTop = initializing ? scrollTop : position.top;
        var colliderHeight = initializing ? targetHeight : height;
        if (offsetTop != null && scrollTop <= offsetTop)
          return 'top';
        if (offsetBottom != null && (colliderTop + colliderHeight >= scrollHeight - offsetBottom))
          return 'bottom';
        return false;
      };
      Affix.prototype.getPinnedOffset = function() {
        if (this.pinnedOffset)
          return this.pinnedOffset;
        this.$element.removeClass(Affix.RESET).addClass('affix');
        var scrollTop = this.$target.scrollTop();
        var position = this.$element.offset();
        return (this.pinnedOffset = position.top - scrollTop);
      };
      Affix.prototype.checkPositionWithEventLoop = function() {
        setTimeout($.proxy(this.checkPosition, this), 1);
      };
      Affix.prototype.checkPosition = function() {
        if (!this.$element.is(':visible'))
          return;
        var height = this.$element.height();
        var offset = this.options.offset;
        var offsetTop = offset.top;
        var offsetBottom = offset.bottom;
        var scrollHeight = Math.max($(document).height(), $(document.body).height());
        if (typeof offset != 'object')
          offsetBottom = offsetTop = offset;
        if (typeof offsetTop == 'function')
          offsetTop = offset.top(this.$element);
        if (typeof offsetBottom == 'function')
          offsetBottom = offset.bottom(this.$element);
        var affix = this.getState(scrollHeight, height, offsetTop, offsetBottom);
        if (this.affixed != affix) {
          if (this.unpin != null)
            this.$element.css('top', '');
          var affixType = 'affix' + (affix ? '-' + affix : '');
          var e = $.Event(affixType + '.bs.affix');
          this.$element.trigger(e);
          if (e.isDefaultPrevented())
            return;
          this.affixed = affix;
          this.unpin = affix == 'bottom' ? this.getPinnedOffset() : null;
          this.$element.removeClass(Affix.RESET).addClass(affixType).trigger(affixType.replace('affix', 'affixed') + '.bs.affix');
        }
        if (affix == 'bottom') {
          this.$element.offset({top: scrollHeight - height - offsetBottom});
        }
      };
      function Plugin(option) {
        return this.each(function() {
          var $this = $(this);
          var data = $this.data('bs.affix');
          var options = typeof option == 'object' && option;
          if (!data)
            $this.data('bs.affix', (data = new Affix(this, options)));
          if (typeof option == 'string')
            data[option]();
        });
      }
      var old = $.fn.affix;
      $.fn.affix = Plugin;
      $.fn.affix.Constructor = Affix;
      $.fn.affix.noConflict = function() {
        $.fn.affix = old;
        return this;
      };
      $(window).on('load', function() {
        $('[data-spy="affix"]').each(function() {
          var $spy = $(this);
          var data = $spy.data();
          data.offset = data.offset || {};
          if (data.offsetBottom != null)
            data.offset.bottom = data.offsetBottom;
          if (data.offsetTop != null)
            data.offset.top = data.offsetTop;
          Plugin.call($spy, data);
        });
      });
    }(jQuery);
  })();
  return _retrieveGlobal();
});

$__System.registerDynamic("1f", ["1e"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('1e');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("20", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  !function($) {
    function elementOrParentIsFixed(element) {
      var $element = $(element);
      var $checkElements = $element.add($element.parents());
      var isFixed = false;
      $checkElements.each(function() {
        if ($(this).css("position") === "fixed") {
          isFixed = true;
          return false;
        }
      });
      return isFixed;
    }
    function UTCDate() {
      return new Date(Date.UTC.apply(Date, arguments));
    }
    function UTCToday() {
      var today = new Date();
      return UTCDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), today.getUTCHours(), today.getUTCMinutes(), today.getUTCSeconds(), 0);
    }
    var Datetimepicker = function(element, options) {
      var that = this;
      this.element = $(element);
      this.container = options.container || 'body';
      this.language = options.language || this.element.data('date-language') || "en";
      this.language = this.language in dates ? this.language : "en";
      this.isRTL = dates[this.language].rtl || false;
      this.formatType = options.formatType || this.element.data('format-type') || 'standard';
      this.format = DPGlobal.parseFormat(options.format || this.element.data('date-format') || dates[this.language].format || DPGlobal.getDefaultFormat(this.formatType, 'input'), this.formatType);
      this.isInline = false;
      this.isVisible = false;
      this.isInput = this.element.is('input');
      this.fontAwesome = options.fontAwesome || this.element.data('font-awesome') || false;
      this.bootcssVer = options.bootcssVer || (this.isInput ? (this.element.is('.form-control') ? 3 : 2) : (this.bootcssVer = this.element.is('.input-group') ? 3 : 2));
      this.component = this.element.is('.date') ? (this.bootcssVer == 3 ? this.element.find('.input-group-addon .glyphicon-th, .input-group-addon .glyphicon-time, .input-group-addon .glyphicon-calendar, .input-group-addon .glyphicon-calendar, .input-group-addon .fa-calendar, .input-group-addon .fa-clock-o').parent() : this.element.find('.add-on .icon-th, .add-on .icon-time, .add-on .icon-calendar .fa-calendar .fa-clock-o').parent()) : false;
      this.componentReset = this.element.is('.date') ? (this.bootcssVer == 3 ? this.element.find(".input-group-addon .glyphicon-remove, .input-group-addon .fa-times").parent() : this.element.find(".add-on .icon-remove, .add-on .fa-times").parent()) : false;
      this.hasInput = this.component && this.element.find('input').length;
      if (this.component && this.component.length === 0) {
        this.component = false;
      }
      this.linkField = options.linkField || this.element.data('link-field') || false;
      this.linkFormat = DPGlobal.parseFormat(options.linkFormat || this.element.data('link-format') || DPGlobal.getDefaultFormat(this.formatType, 'link'), this.formatType);
      this.minuteStep = options.minuteStep || this.element.data('minute-step') || 5;
      this.pickerPosition = options.pickerPosition || this.element.data('picker-position') || 'bottom-right';
      this.showMeridian = options.showMeridian || this.element.data('show-meridian') || false;
      this.initialDate = options.initialDate || new Date();
      this.zIndex = options.zIndex || this.element.data('z-index') || undefined;
      this.icons = {
        leftArrow: this.fontAwesome ? 'fa-arrow-left' : (this.bootcssVer === 3 ? 'glyphicon-arrow-left' : 'icon-arrow-left'),
        rightArrow: this.fontAwesome ? 'fa-arrow-right' : (this.bootcssVer === 3 ? 'glyphicon-arrow-right' : 'icon-arrow-right')
      };
      this.icontype = this.fontAwesome ? 'fa' : 'glyphicon';
      this._attachEvents();
      this.formatViewType = "datetime";
      if ('formatViewType' in options) {
        this.formatViewType = options.formatViewType;
      } else if ('formatViewType' in this.element.data()) {
        this.formatViewType = this.element.data('formatViewType');
      }
      this.minView = 0;
      if ('minView' in options) {
        this.minView = options.minView;
      } else if ('minView' in this.element.data()) {
        this.minView = this.element.data('min-view');
      }
      this.minView = DPGlobal.convertViewMode(this.minView);
      this.maxView = DPGlobal.modes.length - 1;
      if ('maxView' in options) {
        this.maxView = options.maxView;
      } else if ('maxView' in this.element.data()) {
        this.maxView = this.element.data('max-view');
      }
      this.maxView = DPGlobal.convertViewMode(this.maxView);
      this.wheelViewModeNavigation = false;
      if ('wheelViewModeNavigation' in options) {
        this.wheelViewModeNavigation = options.wheelViewModeNavigation;
      } else if ('wheelViewModeNavigation' in this.element.data()) {
        this.wheelViewModeNavigation = this.element.data('view-mode-wheel-navigation');
      }
      this.wheelViewModeNavigationInverseDirection = false;
      if ('wheelViewModeNavigationInverseDirection' in options) {
        this.wheelViewModeNavigationInverseDirection = options.wheelViewModeNavigationInverseDirection;
      } else if ('wheelViewModeNavigationInverseDirection' in this.element.data()) {
        this.wheelViewModeNavigationInverseDirection = this.element.data('view-mode-wheel-navigation-inverse-dir');
      }
      this.wheelViewModeNavigationDelay = 100;
      if ('wheelViewModeNavigationDelay' in options) {
        this.wheelViewModeNavigationDelay = options.wheelViewModeNavigationDelay;
      } else if ('wheelViewModeNavigationDelay' in this.element.data()) {
        this.wheelViewModeNavigationDelay = this.element.data('view-mode-wheel-navigation-delay');
      }
      this.startViewMode = 2;
      if ('startView' in options) {
        this.startViewMode = options.startView;
      } else if ('startView' in this.element.data()) {
        this.startViewMode = this.element.data('start-view');
      }
      this.startViewMode = DPGlobal.convertViewMode(this.startViewMode);
      this.viewMode = this.startViewMode;
      this.viewSelect = this.minView;
      if ('viewSelect' in options) {
        this.viewSelect = options.viewSelect;
      } else if ('viewSelect' in this.element.data()) {
        this.viewSelect = this.element.data('view-select');
      }
      this.viewSelect = DPGlobal.convertViewMode(this.viewSelect);
      this.forceParse = true;
      if ('forceParse' in options) {
        this.forceParse = options.forceParse;
      } else if ('dateForceParse' in this.element.data()) {
        this.forceParse = this.element.data('date-force-parse');
      }
      var template = this.bootcssVer === 3 ? DPGlobal.templateV3 : DPGlobal.template;
      while (template.indexOf('{iconType}') !== -1) {
        template = template.replace('{iconType}', this.icontype);
      }
      while (template.indexOf('{leftArrow}') !== -1) {
        template = template.replace('{leftArrow}', this.icons.leftArrow);
      }
      while (template.indexOf('{rightArrow}') !== -1) {
        template = template.replace('{rightArrow}', this.icons.rightArrow);
      }
      this.picker = $(template).appendTo(this.isInline ? this.element : this.container).on({
        click: $.proxy(this.click, this),
        mousedown: $.proxy(this.mousedown, this)
      });
      if (this.wheelViewModeNavigation) {
        if ($.fn.mousewheel) {
          this.picker.on({mousewheel: $.proxy(this.mousewheel, this)});
        } else {
          console.log("Mouse Wheel event is not supported. Please include the jQuery Mouse Wheel plugin before enabling this option");
        }
      }
      if (this.isInline) {
        this.picker.addClass('datetimepicker-inline');
      } else {
        this.picker.addClass('datetimepicker-dropdown-' + this.pickerPosition + ' dropdown-menu');
      }
      if (this.isRTL) {
        this.picker.addClass('datetimepicker-rtl');
        var selector = this.bootcssVer === 3 ? '.prev span, .next span' : '.prev i, .next i';
        this.picker.find(selector).toggleClass(this.icons.leftArrow + ' ' + this.icons.rightArrow);
      }
      $(document).on('mousedown', function(e) {
        if ($(e.target).closest('.datetimepicker').length === 0) {
          that.hide();
        }
      });
      this.autoclose = false;
      if ('autoclose' in options) {
        this.autoclose = options.autoclose;
      } else if ('dateAutoclose' in this.element.data()) {
        this.autoclose = this.element.data('date-autoclose');
      }
      this.keyboardNavigation = true;
      if ('keyboardNavigation' in options) {
        this.keyboardNavigation = options.keyboardNavigation;
      } else if ('dateKeyboardNavigation' in this.element.data()) {
        this.keyboardNavigation = this.element.data('date-keyboard-navigation');
      }
      this.todayBtn = (options.todayBtn || this.element.data('date-today-btn') || false);
      this.todayHighlight = (options.todayHighlight || this.element.data('date-today-highlight') || false);
      this.weekStart = ((options.weekStart || this.element.data('date-weekstart') || dates[this.language].weekStart || 0) % 7);
      this.weekEnd = ((this.weekStart + 6) % 7);
      this.startDate = -Infinity;
      this.endDate = Infinity;
      this.daysOfWeekDisabled = [];
      this.setStartDate(options.startDate || this.element.data('date-startdate'));
      this.setEndDate(options.endDate || this.element.data('date-enddate'));
      this.setDaysOfWeekDisabled(options.daysOfWeekDisabled || this.element.data('date-days-of-week-disabled'));
      this.setMinutesDisabled(options.minutesDisabled || this.element.data('date-minute-disabled'));
      this.setHoursDisabled(options.hoursDisabled || this.element.data('date-hour-disabled'));
      this.fillDow();
      this.fillMonths();
      this.update();
      this.showMode();
      if (this.isInline) {
        this.show();
      }
    };
    Datetimepicker.prototype = {
      constructor: Datetimepicker,
      _events: [],
      _attachEvents: function() {
        this._detachEvents();
        if (this.isInput) {
          this._events = [[this.element, {
            focus: $.proxy(this.show, this),
            keyup: $.proxy(this.update, this),
            keydown: $.proxy(this.keydown, this)
          }]];
        } else if (this.component && this.hasInput) {
          this._events = [[this.element.find('input'), {
            focus: $.proxy(this.show, this),
            keyup: $.proxy(this.update, this),
            keydown: $.proxy(this.keydown, this)
          }], [this.component, {click: $.proxy(this.show, this)}]];
          if (this.componentReset) {
            this._events.push([this.componentReset, {click: $.proxy(this.reset, this)}]);
          }
        } else if (this.element.is('div')) {
          this.isInline = true;
        } else {
          this._events = [[this.element, {click: $.proxy(this.show, this)}]];
        }
        for (var i = 0,
            el,
            ev; i < this._events.length; i++) {
          el = this._events[i][0];
          ev = this._events[i][1];
          el.on(ev);
        }
      },
      _detachEvents: function() {
        for (var i = 0,
            el,
            ev; i < this._events.length; i++) {
          el = this._events[i][0];
          ev = this._events[i][1];
          el.off(ev);
        }
        this._events = [];
      },
      show: function(e) {
        this.picker.show();
        this.height = this.component ? this.component.outerHeight() : this.element.outerHeight();
        if (this.forceParse) {
          this.update();
        }
        this.place();
        $(window).on('resize', $.proxy(this.place, this));
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        this.isVisible = true;
        this.element.trigger({
          type: 'show',
          date: this.date
        });
      },
      hide: function(e) {
        if (!this.isVisible)
          return;
        if (this.isInline)
          return;
        this.picker.hide();
        $(window).off('resize', this.place);
        this.viewMode = this.startViewMode;
        this.showMode();
        if (!this.isInput) {
          $(document).off('mousedown', this.hide);
        }
        if (this.forceParse && (this.isInput && this.element.val() || this.hasInput && this.element.find('input').val()))
          this.setValue();
        this.isVisible = false;
        this.element.trigger({
          type: 'hide',
          date: this.date
        });
      },
      remove: function() {
        this._detachEvents();
        this.picker.remove();
        delete this.picker;
        delete this.element.data().datetimepicker;
      },
      getDate: function() {
        var d = this.getUTCDate();
        return new Date(d.getTime() + (d.getTimezoneOffset() * 60000));
      },
      getUTCDate: function() {
        return this.date;
      },
      setDate: function(d) {
        this.setUTCDate(new Date(d.getTime() - (d.getTimezoneOffset() * 60000)));
      },
      setUTCDate: function(d) {
        if (d >= this.startDate && d <= this.endDate) {
          this.date = d;
          this.setValue();
          this.viewDate = this.date;
          this.fill();
        } else {
          this.element.trigger({
            type: 'outOfRange',
            date: d,
            startDate: this.startDate,
            endDate: this.endDate
          });
        }
      },
      setFormat: function(format) {
        this.format = DPGlobal.parseFormat(format, this.formatType);
        var element;
        if (this.isInput) {
          element = this.element;
        } else if (this.component) {
          element = this.element.find('input');
        }
        if (element && element.val()) {
          this.setValue();
        }
      },
      setValue: function() {
        var formatted = this.getFormattedDate();
        if (!this.isInput) {
          if (this.component) {
            this.element.find('input').val(formatted);
          }
          this.element.data('date', formatted);
        } else {
          this.element.val(formatted);
        }
        if (this.linkField) {
          $('#' + this.linkField).val(this.getFormattedDate(this.linkFormat));
        }
      },
      getFormattedDate: function(format) {
        if (format == undefined)
          format = this.format;
        return DPGlobal.formatDate(this.date, format, this.language, this.formatType);
      },
      setStartDate: function(startDate) {
        this.startDate = startDate || -Infinity;
        if (this.startDate !== -Infinity) {
          this.startDate = DPGlobal.parseDate(this.startDate, this.format, this.language, this.formatType);
        }
        this.update();
        this.updateNavArrows();
      },
      setEndDate: function(endDate) {
        this.endDate = endDate || Infinity;
        if (this.endDate !== Infinity) {
          this.endDate = DPGlobal.parseDate(this.endDate, this.format, this.language, this.formatType);
        }
        this.update();
        this.updateNavArrows();
      },
      setDaysOfWeekDisabled: function(daysOfWeekDisabled) {
        this.daysOfWeekDisabled = daysOfWeekDisabled || [];
        if (!$.isArray(this.daysOfWeekDisabled)) {
          this.daysOfWeekDisabled = this.daysOfWeekDisabled.split(/,\s*/);
        }
        this.daysOfWeekDisabled = $.map(this.daysOfWeekDisabled, function(d) {
          return parseInt(d, 10);
        });
        this.update();
        this.updateNavArrows();
      },
      setMinutesDisabled: function(minutesDisabled) {
        this.minutesDisabled = minutesDisabled || [];
        if (!$.isArray(this.minutesDisabled)) {
          this.minutesDisabled = this.minutesDisabled.split(/,\s*/);
        }
        this.minutesDisabled = $.map(this.minutesDisabled, function(d) {
          return parseInt(d, 10);
        });
        this.update();
        this.updateNavArrows();
      },
      setHoursDisabled: function(hoursDisabled) {
        this.hoursDisabled = hoursDisabled || [];
        if (!$.isArray(this.hoursDisabled)) {
          this.hoursDisabled = this.hoursDisabled.split(/,\s*/);
        }
        this.hoursDisabled = $.map(this.hoursDisabled, function(d) {
          return parseInt(d, 10);
        });
        this.update();
        this.updateNavArrows();
      },
      place: function() {
        if (this.isInline)
          return;
        if (!this.zIndex) {
          var index_highest = 0;
          $('div').each(function() {
            var index_current = parseInt($(this).css("zIndex"), 10);
            if (index_current > index_highest) {
              index_highest = index_current;
            }
          });
          this.zIndex = index_highest + 10;
        }
        var offset,
            top,
            left,
            containerOffset;
        if (this.container instanceof $) {
          containerOffset = this.container.offset();
        } else {
          containerOffset = $(this.container).offset();
        }
        if (this.component) {
          offset = this.component.offset();
          left = offset.left;
          if (this.pickerPosition == 'bottom-left' || this.pickerPosition == 'top-left') {
            left += this.component.outerWidth() - this.picker.outerWidth();
          }
        } else {
          offset = this.element.offset();
          left = offset.left;
        }
        if (left + 220 > document.body.clientWidth) {
          left = document.body.clientWidth - 220;
        }
        if (this.pickerPosition == 'top-left' || this.pickerPosition == 'top-right') {
          top = offset.top - this.picker.outerHeight();
        } else {
          top = offset.top + this.height;
        }
        top = top - containerOffset.top;
        left = left - containerOffset.left;
        if (!elementOrParentIsFixed(this.element)) {
          top = top + document.body.scrollTop;
        }
        this.picker.css({
          top: top,
          left: left,
          zIndex: this.zIndex
        });
      },
      update: function() {
        var date,
            fromArgs = false;
        if (arguments && arguments.length && (typeof arguments[0] === 'string' || arguments[0] instanceof Date)) {
          date = arguments[0];
          fromArgs = true;
        } else {
          date = (this.isInput ? this.element.val() : this.element.find('input').val()) || this.element.data('date') || this.initialDate;
          if (typeof date == 'string' || date instanceof String) {
            date = date.replace(/^\s+|\s+$/g, '');
          }
        }
        if (!date) {
          date = new Date();
          fromArgs = false;
        }
        this.date = DPGlobal.parseDate(date, this.format, this.language, this.formatType);
        if (fromArgs)
          this.setValue();
        if (this.date < this.startDate) {
          this.viewDate = new Date(this.startDate);
        } else if (this.date > this.endDate) {
          this.viewDate = new Date(this.endDate);
        } else {
          this.viewDate = new Date(this.date);
        }
        this.fill();
      },
      fillDow: function() {
        var dowCnt = this.weekStart,
            html = '<tr>';
        while (dowCnt < this.weekStart + 7) {
          html += '<th class="dow">' + dates[this.language].daysMin[(dowCnt++) % 7] + '</th>';
        }
        html += '</tr>';
        this.picker.find('.datetimepicker-days thead').append(html);
      },
      fillMonths: function() {
        var html = '',
            i = 0;
        while (i < 12) {
          html += '<span class="month">' + dates[this.language].monthsShort[i++] + '</span>';
        }
        this.picker.find('.datetimepicker-months td').html(html);
      },
      fill: function() {
        if (this.date == null || this.viewDate == null) {
          return;
        }
        var d = new Date(this.viewDate),
            year = d.getUTCFullYear(),
            month = d.getUTCMonth(),
            dayMonth = d.getUTCDate(),
            hours = d.getUTCHours(),
            minutes = d.getUTCMinutes(),
            startYear = this.startDate !== -Infinity ? this.startDate.getUTCFullYear() : -Infinity,
            startMonth = this.startDate !== -Infinity ? this.startDate.getUTCMonth() + 1 : -Infinity,
            endYear = this.endDate !== Infinity ? this.endDate.getUTCFullYear() : Infinity,
            endMonth = this.endDate !== Infinity ? this.endDate.getUTCMonth() + 1 : Infinity,
            currentDate = (new UTCDate(this.date.getUTCFullYear(), this.date.getUTCMonth(), this.date.getUTCDate())).valueOf(),
            today = new Date();
        this.picker.find('.datetimepicker-days thead th:eq(1)').text(dates[this.language].months[month] + ' ' + year);
        if (this.formatViewType == "time") {
          var formatted = this.getFormattedDate();
          this.picker.find('.datetimepicker-hours thead th:eq(1)').text(formatted);
          this.picker.find('.datetimepicker-minutes thead th:eq(1)').text(formatted);
        } else {
          this.picker.find('.datetimepicker-hours thead th:eq(1)').text(dayMonth + ' ' + dates[this.language].months[month] + ' ' + year);
          this.picker.find('.datetimepicker-minutes thead th:eq(1)').text(dayMonth + ' ' + dates[this.language].months[month] + ' ' + year);
        }
        this.picker.find('tfoot th.today').text(dates[this.language].today).toggle(this.todayBtn !== false);
        this.updateNavArrows();
        this.fillMonths();
        var prevMonth = UTCDate(year, month - 1, 28, 0, 0, 0, 0),
            day = DPGlobal.getDaysInMonth(prevMonth.getUTCFullYear(), prevMonth.getUTCMonth());
        prevMonth.setUTCDate(day);
        prevMonth.setUTCDate(day - (prevMonth.getUTCDay() - this.weekStart + 7) % 7);
        var nextMonth = new Date(prevMonth);
        nextMonth.setUTCDate(nextMonth.getUTCDate() + 42);
        nextMonth = nextMonth.valueOf();
        var html = [];
        var clsName;
        while (prevMonth.valueOf() < nextMonth) {
          if (prevMonth.getUTCDay() == this.weekStart) {
            html.push('<tr>');
          }
          clsName = '';
          if (prevMonth.getUTCFullYear() < year || (prevMonth.getUTCFullYear() == year && prevMonth.getUTCMonth() < month)) {
            clsName += ' old';
          } else if (prevMonth.getUTCFullYear() > year || (prevMonth.getUTCFullYear() == year && prevMonth.getUTCMonth() > month)) {
            clsName += ' new';
          }
          if (this.todayHighlight && prevMonth.getUTCFullYear() == today.getFullYear() && prevMonth.getUTCMonth() == today.getMonth() && prevMonth.getUTCDate() == today.getDate()) {
            clsName += ' today';
          }
          if (prevMonth.valueOf() == currentDate) {
            clsName += ' active';
          }
          if ((prevMonth.valueOf() + 86400000) <= this.startDate || prevMonth.valueOf() > this.endDate || $.inArray(prevMonth.getUTCDay(), this.daysOfWeekDisabled) !== -1) {
            clsName += ' disabled';
          }
          html.push('<td class="day' + clsName + '">' + prevMonth.getUTCDate() + '</td>');
          if (prevMonth.getUTCDay() == this.weekEnd) {
            html.push('</tr>');
          }
          prevMonth.setUTCDate(prevMonth.getUTCDate() + 1);
        }
        this.picker.find('.datetimepicker-days tbody').empty().append(html.join(''));
        html = [];
        var txt = '',
            meridian = '',
            meridianOld = '';
        var hoursDisabled = this.hoursDisabled || [];
        for (var i = 0; i < 24; i++) {
          if (hoursDisabled.indexOf(i) !== -1)
            continue;
          var actual = UTCDate(year, month, dayMonth, i);
          clsName = '';
          if ((actual.valueOf() + 3600000) <= this.startDate || actual.valueOf() > this.endDate) {
            clsName += ' disabled';
          } else if (hours == i) {
            clsName += ' active';
          }
          if (this.showMeridian && dates[this.language].meridiem.length == 2) {
            meridian = (i < 12 ? dates[this.language].meridiem[0] : dates[this.language].meridiem[1]);
            if (meridian != meridianOld) {
              if (meridianOld != '') {
                html.push('</fieldset>');
              }
              html.push('<fieldset class="hour"><legend>' + meridian.toUpperCase() + '</legend>');
            }
            meridianOld = meridian;
            txt = (i % 12 ? i % 12 : 12);
            html.push('<span class="hour' + clsName + ' hour_' + (i < 12 ? 'am' : 'pm') + '">' + txt + '</span>');
            if (i == 23) {
              html.push('</fieldset>');
            }
          } else {
            txt = i + ':00';
            html.push('<span class="hour' + clsName + '">' + txt + '</span>');
          }
        }
        this.picker.find('.datetimepicker-hours td').html(html.join(''));
        html = [];
        txt = '', meridian = '', meridianOld = '';
        var minutesDisabled = this.minutesDisabled || [];
        for (var i = 0; i < 60; i += this.minuteStep) {
          if (minutesDisabled.indexOf(i) !== -1)
            continue;
          var actual = UTCDate(year, month, dayMonth, hours, i, 0);
          clsName = '';
          if (actual.valueOf() < this.startDate || actual.valueOf() > this.endDate) {
            clsName += ' disabled';
          } else if (Math.floor(minutes / this.minuteStep) == Math.floor(i / this.minuteStep)) {
            clsName += ' active';
          }
          if (this.showMeridian && dates[this.language].meridiem.length == 2) {
            meridian = (hours < 12 ? dates[this.language].meridiem[0] : dates[this.language].meridiem[1]);
            if (meridian != meridianOld) {
              if (meridianOld != '') {
                html.push('</fieldset>');
              }
              html.push('<fieldset class="minute"><legend>' + meridian.toUpperCase() + '</legend>');
            }
            meridianOld = meridian;
            txt = (hours % 12 ? hours % 12 : 12);
            html.push('<span class="minute' + clsName + '">' + txt + ':' + (i < 10 ? '0' + i : i) + '</span>');
            if (i == 59) {
              html.push('</fieldset>');
            }
          } else {
            txt = i + ':00';
            html.push('<span class="minute' + clsName + '">' + hours + ':' + (i < 10 ? '0' + i : i) + '</span>');
          }
        }
        this.picker.find('.datetimepicker-minutes td').html(html.join(''));
        var currentYear = this.date.getUTCFullYear();
        var months = this.picker.find('.datetimepicker-months').find('th:eq(1)').text(year).end().find('span').removeClass('active');
        if (currentYear == year) {
          var offset = months.length - 12;
          months.eq(this.date.getUTCMonth() + offset).addClass('active');
        }
        if (year < startYear || year > endYear) {
          months.addClass('disabled');
        }
        if (year == startYear) {
          months.slice(0, startMonth + 1).addClass('disabled');
        }
        if (year == endYear) {
          months.slice(endMonth).addClass('disabled');
        }
        html = '';
        year = parseInt(year / 10, 10) * 10;
        var yearCont = this.picker.find('.datetimepicker-years').find('th:eq(1)').text(year + '-' + (year + 9)).end().find('td');
        year -= 1;
        for (var i = -1; i < 11; i++) {
          html += '<span class="year' + (i == -1 || i == 10 ? ' old' : '') + (currentYear == year ? ' active' : '') + (year < startYear || year > endYear ? ' disabled' : '') + '">' + year + '</span>';
          year += 1;
        }
        yearCont.html(html);
        this.place();
      },
      updateNavArrows: function() {
        var d = new Date(this.viewDate),
            year = d.getUTCFullYear(),
            month = d.getUTCMonth(),
            day = d.getUTCDate(),
            hour = d.getUTCHours();
        switch (this.viewMode) {
          case 0:
            if (this.startDate !== -Infinity && year <= this.startDate.getUTCFullYear() && month <= this.startDate.getUTCMonth() && day <= this.startDate.getUTCDate() && hour <= this.startDate.getUTCHours()) {
              this.picker.find('.prev').css({visibility: 'hidden'});
            } else {
              this.picker.find('.prev').css({visibility: 'visible'});
            }
            if (this.endDate !== Infinity && year >= this.endDate.getUTCFullYear() && month >= this.endDate.getUTCMonth() && day >= this.endDate.getUTCDate() && hour >= this.endDate.getUTCHours()) {
              this.picker.find('.next').css({visibility: 'hidden'});
            } else {
              this.picker.find('.next').css({visibility: 'visible'});
            }
            break;
          case 1:
            if (this.startDate !== -Infinity && year <= this.startDate.getUTCFullYear() && month <= this.startDate.getUTCMonth() && day <= this.startDate.getUTCDate()) {
              this.picker.find('.prev').css({visibility: 'hidden'});
            } else {
              this.picker.find('.prev').css({visibility: 'visible'});
            }
            if (this.endDate !== Infinity && year >= this.endDate.getUTCFullYear() && month >= this.endDate.getUTCMonth() && day >= this.endDate.getUTCDate()) {
              this.picker.find('.next').css({visibility: 'hidden'});
            } else {
              this.picker.find('.next').css({visibility: 'visible'});
            }
            break;
          case 2:
            if (this.startDate !== -Infinity && year <= this.startDate.getUTCFullYear() && month <= this.startDate.getUTCMonth()) {
              this.picker.find('.prev').css({visibility: 'hidden'});
            } else {
              this.picker.find('.prev').css({visibility: 'visible'});
            }
            if (this.endDate !== Infinity && year >= this.endDate.getUTCFullYear() && month >= this.endDate.getUTCMonth()) {
              this.picker.find('.next').css({visibility: 'hidden'});
            } else {
              this.picker.find('.next').css({visibility: 'visible'});
            }
            break;
          case 3:
          case 4:
            if (this.startDate !== -Infinity && year <= this.startDate.getUTCFullYear()) {
              this.picker.find('.prev').css({visibility: 'hidden'});
            } else {
              this.picker.find('.prev').css({visibility: 'visible'});
            }
            if (this.endDate !== Infinity && year >= this.endDate.getUTCFullYear()) {
              this.picker.find('.next').css({visibility: 'hidden'});
            } else {
              this.picker.find('.next').css({visibility: 'visible'});
            }
            break;
        }
      },
      mousewheel: function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (this.wheelPause) {
          return;
        }
        this.wheelPause = true;
        var originalEvent = e.originalEvent;
        var delta = originalEvent.wheelDelta;
        var mode = delta > 0 ? 1 : (delta === 0) ? 0 : -1;
        if (this.wheelViewModeNavigationInverseDirection) {
          mode = -mode;
        }
        this.showMode(mode);
        setTimeout($.proxy(function() {
          this.wheelPause = false;
        }, this), this.wheelViewModeNavigationDelay);
      },
      click: function(e) {
        e.stopPropagation();
        e.preventDefault();
        var target = $(e.target).closest('span, td, th, legend');
        if (target.is('.' + this.icontype)) {
          target = $(target).parent().closest('span, td, th, legend');
        }
        if (target.length == 1) {
          if (target.is('.disabled')) {
            this.element.trigger({
              type: 'outOfRange',
              date: this.viewDate,
              startDate: this.startDate,
              endDate: this.endDate
            });
            return;
          }
          switch (target[0].nodeName.toLowerCase()) {
            case 'th':
              switch (target[0].className) {
                case 'switch':
                  this.showMode(1);
                  break;
                case 'prev':
                case 'next':
                  var dir = DPGlobal.modes[this.viewMode].navStep * (target[0].className == 'prev' ? -1 : 1);
                  switch (this.viewMode) {
                    case 0:
                      this.viewDate = this.moveHour(this.viewDate, dir);
                      break;
                    case 1:
                      this.viewDate = this.moveDate(this.viewDate, dir);
                      break;
                    case 2:
                      this.viewDate = this.moveMonth(this.viewDate, dir);
                      break;
                    case 3:
                    case 4:
                      this.viewDate = this.moveYear(this.viewDate, dir);
                      break;
                  }
                  this.fill();
                  this.element.trigger({
                    type: target[0].className + ':' + this.convertViewModeText(this.viewMode),
                    date: this.viewDate,
                    startDate: this.startDate,
                    endDate: this.endDate
                  });
                  break;
                case 'today':
                  var date = new Date();
                  date = UTCDate(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), 0);
                  if (date < this.startDate)
                    date = this.startDate;
                  else if (date > this.endDate)
                    date = this.endDate;
                  this.viewMode = this.startViewMode;
                  this.showMode(0);
                  this._setDate(date);
                  this.fill();
                  if (this.autoclose) {
                    this.hide();
                  }
                  break;
              }
              break;
            case 'span':
              if (!target.is('.disabled')) {
                var year = this.viewDate.getUTCFullYear(),
                    month = this.viewDate.getUTCMonth(),
                    day = this.viewDate.getUTCDate(),
                    hours = this.viewDate.getUTCHours(),
                    minutes = this.viewDate.getUTCMinutes(),
                    seconds = this.viewDate.getUTCSeconds();
                if (target.is('.month')) {
                  this.viewDate.setUTCDate(1);
                  month = target.parent().find('span').index(target);
                  day = this.viewDate.getUTCDate();
                  this.viewDate.setUTCMonth(month);
                  this.element.trigger({
                    type: 'changeMonth',
                    date: this.viewDate
                  });
                  if (this.viewSelect >= 3) {
                    this._setDate(UTCDate(year, month, day, hours, minutes, seconds, 0));
                  }
                } else if (target.is('.year')) {
                  this.viewDate.setUTCDate(1);
                  year = parseInt(target.text(), 10) || 0;
                  this.viewDate.setUTCFullYear(year);
                  this.element.trigger({
                    type: 'changeYear',
                    date: this.viewDate
                  });
                  if (this.viewSelect >= 4) {
                    this._setDate(UTCDate(year, month, day, hours, minutes, seconds, 0));
                  }
                } else if (target.is('.hour')) {
                  hours = parseInt(target.text(), 10) || 0;
                  if (target.hasClass('hour_am') || target.hasClass('hour_pm')) {
                    if (hours == 12 && target.hasClass('hour_am')) {
                      hours = 0;
                    } else if (hours != 12 && target.hasClass('hour_pm')) {
                      hours += 12;
                    }
                  }
                  this.viewDate.setUTCHours(hours);
                  this.element.trigger({
                    type: 'changeHour',
                    date: this.viewDate
                  });
                  if (this.viewSelect >= 1) {
                    this._setDate(UTCDate(year, month, day, hours, minutes, seconds, 0));
                  }
                } else if (target.is('.minute')) {
                  minutes = parseInt(target.text().substr(target.text().indexOf(':') + 1), 10) || 0;
                  this.viewDate.setUTCMinutes(minutes);
                  this.element.trigger({
                    type: 'changeMinute',
                    date: this.viewDate
                  });
                  if (this.viewSelect >= 0) {
                    this._setDate(UTCDate(year, month, day, hours, minutes, seconds, 0));
                  }
                }
                if (this.viewMode != 0) {
                  var oldViewMode = this.viewMode;
                  this.showMode(-1);
                  this.fill();
                  if (oldViewMode == this.viewMode && this.autoclose) {
                    this.hide();
                  }
                } else {
                  this.fill();
                  if (this.autoclose) {
                    this.hide();
                  }
                }
              }
              break;
            case 'td':
              if (target.is('.day') && !target.is('.disabled')) {
                var day = parseInt(target.text(), 10) || 1;
                var year = this.viewDate.getUTCFullYear(),
                    month = this.viewDate.getUTCMonth(),
                    hours = this.viewDate.getUTCHours(),
                    minutes = this.viewDate.getUTCMinutes(),
                    seconds = this.viewDate.getUTCSeconds();
                if (target.is('.old')) {
                  if (month === 0) {
                    month = 11;
                    year -= 1;
                  } else {
                    month -= 1;
                  }
                } else if (target.is('.new')) {
                  if (month == 11) {
                    month = 0;
                    year += 1;
                  } else {
                    month += 1;
                  }
                }
                this.viewDate.setUTCFullYear(year);
                this.viewDate.setUTCMonth(month, day);
                this.element.trigger({
                  type: 'changeDay',
                  date: this.viewDate
                });
                if (this.viewSelect >= 2) {
                  this._setDate(UTCDate(year, month, day, hours, minutes, seconds, 0));
                }
              }
              var oldViewMode = this.viewMode;
              this.showMode(-1);
              this.fill();
              if (oldViewMode == this.viewMode && this.autoclose) {
                this.hide();
              }
              break;
          }
        }
      },
      _setDate: function(date, which) {
        if (!which || which == 'date')
          this.date = date;
        if (!which || which == 'view')
          this.viewDate = date;
        this.fill();
        this.setValue();
        var element;
        if (this.isInput) {
          element = this.element;
        } else if (this.component) {
          element = this.element.find('input');
        }
        if (element) {
          element.change();
          if (this.autoclose && (!which || which == 'date')) {}
        }
        this.element.trigger({
          type: 'changeDate',
          date: this.date
        });
        if (date == null)
          this.date = this.viewDate;
      },
      moveMinute: function(date, dir) {
        if (!dir)
          return date;
        var new_date = new Date(date.valueOf());
        new_date.setUTCMinutes(new_date.getUTCMinutes() + (dir * this.minuteStep));
        return new_date;
      },
      moveHour: function(date, dir) {
        if (!dir)
          return date;
        var new_date = new Date(date.valueOf());
        new_date.setUTCHours(new_date.getUTCHours() + dir);
        return new_date;
      },
      moveDate: function(date, dir) {
        if (!dir)
          return date;
        var new_date = new Date(date.valueOf());
        new_date.setUTCDate(new_date.getUTCDate() + dir);
        return new_date;
      },
      moveMonth: function(date, dir) {
        if (!dir)
          return date;
        var new_date = new Date(date.valueOf()),
            day = new_date.getUTCDate(),
            month = new_date.getUTCMonth(),
            mag = Math.abs(dir),
            new_month,
            test;
        dir = dir > 0 ? 1 : -1;
        if (mag == 1) {
          test = dir == -1 ? function() {
            return new_date.getUTCMonth() == month;
          } : function() {
            return new_date.getUTCMonth() != new_month;
          };
          new_month = month + dir;
          new_date.setUTCMonth(new_month);
          if (new_month < 0 || new_month > 11)
            new_month = (new_month + 12) % 12;
        } else {
          for (var i = 0; i < mag; i++)
            new_date = this.moveMonth(new_date, dir);
          new_month = new_date.getUTCMonth();
          new_date.setUTCDate(day);
          test = function() {
            return new_month != new_date.getUTCMonth();
          };
        }
        while (test()) {
          new_date.setUTCDate(--day);
          new_date.setUTCMonth(new_month);
        }
        return new_date;
      },
      moveYear: function(date, dir) {
        return this.moveMonth(date, dir * 12);
      },
      dateWithinRange: function(date) {
        return date >= this.startDate && date <= this.endDate;
      },
      keydown: function(e) {
        if (this.picker.is(':not(:visible)')) {
          if (e.keyCode == 27)
            this.show();
          return;
        }
        var dateChanged = false,
            dir,
            day,
            month,
            newDate,
            newViewDate;
        switch (e.keyCode) {
          case 27:
            this.hide();
            e.preventDefault();
            break;
          case 37:
          case 39:
            if (!this.keyboardNavigation)
              break;
            dir = e.keyCode == 37 ? -1 : 1;
            viewMode = this.viewMode;
            if (e.ctrlKey) {
              viewMode += 2;
            } else if (e.shiftKey) {
              viewMode += 1;
            }
            if (viewMode == 4) {
              newDate = this.moveYear(this.date, dir);
              newViewDate = this.moveYear(this.viewDate, dir);
            } else if (viewMode == 3) {
              newDate = this.moveMonth(this.date, dir);
              newViewDate = this.moveMonth(this.viewDate, dir);
            } else if (viewMode == 2) {
              newDate = this.moveDate(this.date, dir);
              newViewDate = this.moveDate(this.viewDate, dir);
            } else if (viewMode == 1) {
              newDate = this.moveHour(this.date, dir);
              newViewDate = this.moveHour(this.viewDate, dir);
            } else if (viewMode == 0) {
              newDate = this.moveMinute(this.date, dir);
              newViewDate = this.moveMinute(this.viewDate, dir);
            }
            if (this.dateWithinRange(newDate)) {
              this.date = newDate;
              this.viewDate = newViewDate;
              this.setValue();
              this.update();
              e.preventDefault();
              dateChanged = true;
            }
            break;
          case 38:
          case 40:
            if (!this.keyboardNavigation)
              break;
            dir = e.keyCode == 38 ? -1 : 1;
            viewMode = this.viewMode;
            if (e.ctrlKey) {
              viewMode += 2;
            } else if (e.shiftKey) {
              viewMode += 1;
            }
            if (viewMode == 4) {
              newDate = this.moveYear(this.date, dir);
              newViewDate = this.moveYear(this.viewDate, dir);
            } else if (viewMode == 3) {
              newDate = this.moveMonth(this.date, dir);
              newViewDate = this.moveMonth(this.viewDate, dir);
            } else if (viewMode == 2) {
              newDate = this.moveDate(this.date, dir * 7);
              newViewDate = this.moveDate(this.viewDate, dir * 7);
            } else if (viewMode == 1) {
              if (this.showMeridian) {
                newDate = this.moveHour(this.date, dir * 6);
                newViewDate = this.moveHour(this.viewDate, dir * 6);
              } else {
                newDate = this.moveHour(this.date, dir * 4);
                newViewDate = this.moveHour(this.viewDate, dir * 4);
              }
            } else if (viewMode == 0) {
              newDate = this.moveMinute(this.date, dir * 4);
              newViewDate = this.moveMinute(this.viewDate, dir * 4);
            }
            if (this.dateWithinRange(newDate)) {
              this.date = newDate;
              this.viewDate = newViewDate;
              this.setValue();
              this.update();
              e.preventDefault();
              dateChanged = true;
            }
            break;
          case 13:
            if (this.viewMode != 0) {
              var oldViewMode = this.viewMode;
              this.showMode(-1);
              this.fill();
              if (oldViewMode == this.viewMode && this.autoclose) {
                this.hide();
              }
            } else {
              this.fill();
              if (this.autoclose) {
                this.hide();
              }
            }
            e.preventDefault();
            break;
          case 9:
            this.hide();
            break;
        }
        if (dateChanged) {
          var element;
          if (this.isInput) {
            element = this.element;
          } else if (this.component) {
            element = this.element.find('input');
          }
          if (element) {
            element.change();
          }
          this.element.trigger({
            type: 'changeDate',
            date: this.date
          });
        }
      },
      showMode: function(dir) {
        if (dir) {
          var newViewMode = Math.max(0, Math.min(DPGlobal.modes.length - 1, this.viewMode + dir));
          if (newViewMode >= this.minView && newViewMode <= this.maxView) {
            this.element.trigger({
              type: 'changeMode',
              date: this.viewDate,
              oldViewMode: this.viewMode,
              newViewMode: newViewMode
            });
            this.viewMode = newViewMode;
          }
        }
        this.picker.find('>div').hide().filter('.datetimepicker-' + DPGlobal.modes[this.viewMode].clsName).css('display', 'block');
        this.updateNavArrows();
      },
      reset: function(e) {
        this._setDate(null, 'date');
      },
      convertViewModeText: function(viewMode) {
        switch (viewMode) {
          case 4:
            return 'decade';
          case 3:
            return 'year';
          case 2:
            return 'month';
          case 1:
            return 'day';
          case 0:
            return 'hour';
        }
      }
    };
    var old = $.fn.datetimepicker;
    $.fn.datetimepicker = function(option) {
      var args = Array.apply(null, arguments);
      args.shift();
      var internal_return;
      this.each(function() {
        var $this = $(this),
            data = $this.data('datetimepicker'),
            options = typeof option == 'object' && option;
        if (!data) {
          $this.data('datetimepicker', (data = new Datetimepicker(this, $.extend({}, $.fn.datetimepicker.defaults, options))));
        }
        if (typeof option == 'string' && typeof data[option] == 'function') {
          internal_return = data[option].apply(data, args);
          if (internal_return !== undefined) {
            return false;
          }
        }
      });
      if (internal_return !== undefined)
        return internal_return;
      else
        return this;
    };
    $.fn.datetimepicker.defaults = {};
    $.fn.datetimepicker.Constructor = Datetimepicker;
    var dates = $.fn.datetimepicker.dates = {en: {
        days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        daysShort: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        daysMin: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
        months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
        monthsShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        meridiem: ["am", "pm"],
        suffix: ["st", "nd", "rd", "th"],
        today: "Today"
      }};
    var DPGlobal = {
      modes: [{
        clsName: 'minutes',
        navFnc: 'Hours',
        navStep: 1
      }, {
        clsName: 'hours',
        navFnc: 'Date',
        navStep: 1
      }, {
        clsName: 'days',
        navFnc: 'Month',
        navStep: 1
      }, {
        clsName: 'months',
        navFnc: 'FullYear',
        navStep: 1
      }, {
        clsName: 'years',
        navFnc: 'FullYear',
        navStep: 10
      }],
      isLeapYear: function(year) {
        return (((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0));
      },
      getDaysInMonth: function(year, month) {
        return [31, (DPGlobal.isLeapYear(year) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
      },
      getDefaultFormat: function(type, field) {
        if (type == "standard") {
          if (field == 'input')
            return 'yyyy-mm-dd hh:ii';
          else
            return 'yyyy-mm-dd hh:ii:ss';
        } else if (type == "php") {
          if (field == 'input')
            return 'Y-m-d H:i';
          else
            return 'Y-m-d H:i:s';
        } else {
          throw new Error("Invalid format type.");
        }
      },
      validParts: function(type) {
        if (type == "standard") {
          return /hh?|HH?|p|P|ii?|ss?|dd?|DD?|mm?|MM?|yy(?:yy)?/g;
        } else if (type == "php") {
          return /[dDjlNwzFmMnStyYaABgGhHis]/g;
        } else {
          throw new Error("Invalid format type.");
        }
      },
      nonpunctuation: /[^ -\/:-@\[-`{-~\t\n\rTZ]+/g,
      parseFormat: function(format, type) {
        var separators = format.replace(this.validParts(type), '\0').split('\0'),
            parts = format.match(this.validParts(type));
        if (!separators || !separators.length || !parts || parts.length == 0) {
          throw new Error("Invalid date format.");
        }
        return {
          separators: separators,
          parts: parts
        };
      },
      parseDate: function(date, format, language, type) {
        if (date instanceof Date) {
          var dateUTC = new Date(date.valueOf() - date.getTimezoneOffset() * 60000);
          dateUTC.setMilliseconds(0);
          return dateUTC;
        }
        if (/^\d{4}\-\d{1,2}\-\d{1,2}$/.test(date)) {
          format = this.parseFormat('yyyy-mm-dd', type);
        }
        if (/^\d{4}\-\d{1,2}\-\d{1,2}[T ]\d{1,2}\:\d{1,2}$/.test(date)) {
          format = this.parseFormat('yyyy-mm-dd hh:ii', type);
        }
        if (/^\d{4}\-\d{1,2}\-\d{1,2}[T ]\d{1,2}\:\d{1,2}\:\d{1,2}[Z]{0,1}$/.test(date)) {
          format = this.parseFormat('yyyy-mm-dd hh:ii:ss', type);
        }
        if (/^[-+]\d+[dmwy]([\s,]+[-+]\d+[dmwy])*$/.test(date)) {
          var part_re = /([-+]\d+)([dmwy])/,
              parts = date.match(/([-+]\d+)([dmwy])/g),
              part,
              dir;
          date = new Date();
          for (var i = 0; i < parts.length; i++) {
            part = part_re.exec(parts[i]);
            dir = parseInt(part[1]);
            switch (part[2]) {
              case 'd':
                date.setUTCDate(date.getUTCDate() + dir);
                break;
              case 'm':
                date = Datetimepicker.prototype.moveMonth.call(Datetimepicker.prototype, date, dir);
                break;
              case 'w':
                date.setUTCDate(date.getUTCDate() + dir * 7);
                break;
              case 'y':
                date = Datetimepicker.prototype.moveYear.call(Datetimepicker.prototype, date, dir);
                break;
            }
          }
          return UTCDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), 0);
        }
        var parts = date && date.toString().match(this.nonpunctuation) || [],
            date = new Date(0, 0, 0, 0, 0, 0, 0),
            parsed = {},
            setters_order = ['hh', 'h', 'ii', 'i', 'ss', 's', 'yyyy', 'yy', 'M', 'MM', 'm', 'mm', 'D', 'DD', 'd', 'dd', 'H', 'HH', 'p', 'P'],
            setters_map = {
              hh: function(d, v) {
                return d.setUTCHours(v);
              },
              h: function(d, v) {
                return d.setUTCHours(v);
              },
              HH: function(d, v) {
                return d.setUTCHours(v == 12 ? 0 : v);
              },
              H: function(d, v) {
                return d.setUTCHours(v == 12 ? 0 : v);
              },
              ii: function(d, v) {
                return d.setUTCMinutes(v);
              },
              i: function(d, v) {
                return d.setUTCMinutes(v);
              },
              ss: function(d, v) {
                return d.setUTCSeconds(v);
              },
              s: function(d, v) {
                return d.setUTCSeconds(v);
              },
              yyyy: function(d, v) {
                return d.setUTCFullYear(v);
              },
              yy: function(d, v) {
                return d.setUTCFullYear(2000 + v);
              },
              m: function(d, v) {
                v -= 1;
                while (v < 0)
                  v += 12;
                v %= 12;
                d.setUTCMonth(v);
                while (d.getUTCMonth() != v)
                  if (isNaN(d.getUTCMonth()))
                    return d;
                  else
                    d.setUTCDate(d.getUTCDate() - 1);
                return d;
              },
              d: function(d, v) {
                return d.setUTCDate(v);
              },
              p: function(d, v) {
                return d.setUTCHours(v == 1 ? d.getUTCHours() + 12 : d.getUTCHours());
              }
            },
            val,
            filtered,
            part;
        setters_map['M'] = setters_map['MM'] = setters_map['mm'] = setters_map['m'];
        setters_map['dd'] = setters_map['d'];
        setters_map['P'] = setters_map['p'];
        date = UTCDate(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds());
        if (parts.length == format.parts.length) {
          for (var i = 0,
              cnt = format.parts.length; i < cnt; i++) {
            val = parseInt(parts[i], 10);
            part = format.parts[i];
            if (isNaN(val)) {
              switch (part) {
                case 'MM':
                  filtered = $(dates[language].months).filter(function() {
                    var m = this.slice(0, parts[i].length),
                        p = parts[i].slice(0, m.length);
                    return m == p;
                  });
                  val = $.inArray(filtered[0], dates[language].months) + 1;
                  break;
                case 'M':
                  filtered = $(dates[language].monthsShort).filter(function() {
                    var m = this.slice(0, parts[i].length),
                        p = parts[i].slice(0, m.length);
                    return m.toLowerCase() == p.toLowerCase();
                  });
                  val = $.inArray(filtered[0], dates[language].monthsShort) + 1;
                  break;
                case 'p':
                case 'P':
                  val = $.inArray(parts[i].toLowerCase(), dates[language].meridiem);
                  break;
              }
            }
            parsed[part] = val;
          }
          for (var i = 0,
              s; i < setters_order.length; i++) {
            s = setters_order[i];
            if (s in parsed && !isNaN(parsed[s]))
              setters_map[s](date, parsed[s]);
          }
        }
        return date;
      },
      formatDate: function(date, format, language, type) {
        if (date == null) {
          return '';
        }
        var val;
        if (type == 'standard') {
          val = {
            yy: date.getUTCFullYear().toString().substring(2),
            yyyy: date.getUTCFullYear(),
            m: date.getUTCMonth() + 1,
            M: dates[language].monthsShort[date.getUTCMonth()],
            MM: dates[language].months[date.getUTCMonth()],
            d: date.getUTCDate(),
            D: dates[language].daysShort[date.getUTCDay()],
            DD: dates[language].days[date.getUTCDay()],
            p: (dates[language].meridiem.length == 2 ? dates[language].meridiem[date.getUTCHours() < 12 ? 0 : 1] : ''),
            h: date.getUTCHours(),
            i: date.getUTCMinutes(),
            s: date.getUTCSeconds()
          };
          if (dates[language].meridiem.length == 2) {
            val.H = (val.h % 12 == 0 ? 12 : val.h % 12);
          } else {
            val.H = val.h;
          }
          val.HH = (val.H < 10 ? '0' : '') + val.H;
          val.P = val.p.toUpperCase();
          val.hh = (val.h < 10 ? '0' : '') + val.h;
          val.ii = (val.i < 10 ? '0' : '') + val.i;
          val.ss = (val.s < 10 ? '0' : '') + val.s;
          val.dd = (val.d < 10 ? '0' : '') + val.d;
          val.mm = (val.m < 10 ? '0' : '') + val.m;
        } else if (type == 'php') {
          val = {
            y: date.getUTCFullYear().toString().substring(2),
            Y: date.getUTCFullYear(),
            F: dates[language].months[date.getUTCMonth()],
            M: dates[language].monthsShort[date.getUTCMonth()],
            n: date.getUTCMonth() + 1,
            t: DPGlobal.getDaysInMonth(date.getUTCFullYear(), date.getUTCMonth()),
            j: date.getUTCDate(),
            l: dates[language].days[date.getUTCDay()],
            D: dates[language].daysShort[date.getUTCDay()],
            w: date.getUTCDay(),
            N: (date.getUTCDay() == 0 ? 7 : date.getUTCDay()),
            S: (date.getUTCDate() % 10 <= dates[language].suffix.length ? dates[language].suffix[date.getUTCDate() % 10 - 1] : ''),
            a: (dates[language].meridiem.length == 2 ? dates[language].meridiem[date.getUTCHours() < 12 ? 0 : 1] : ''),
            g: (date.getUTCHours() % 12 == 0 ? 12 : date.getUTCHours() % 12),
            G: date.getUTCHours(),
            i: date.getUTCMinutes(),
            s: date.getUTCSeconds()
          };
          val.m = (val.n < 10 ? '0' : '') + val.n;
          val.d = (val.j < 10 ? '0' : '') + val.j;
          val.A = val.a.toString().toUpperCase();
          val.h = (val.g < 10 ? '0' : '') + val.g;
          val.H = (val.G < 10 ? '0' : '') + val.G;
          val.i = (val.i < 10 ? '0' : '') + val.i;
          val.s = (val.s < 10 ? '0' : '') + val.s;
        } else {
          throw new Error("Invalid format type.");
        }
        var date = [],
            seps = $.extend([], format.separators);
        for (var i = 0,
            cnt = format.parts.length; i < cnt; i++) {
          if (seps.length) {
            date.push(seps.shift());
          }
          date.push(val[format.parts[i]]);
        }
        if (seps.length) {
          date.push(seps.shift());
        }
        return date.join('');
      },
      convertViewMode: function(viewMode) {
        switch (viewMode) {
          case 4:
          case 'decade':
            viewMode = 4;
            break;
          case 3:
          case 'year':
            viewMode = 3;
            break;
          case 2:
          case 'month':
            viewMode = 2;
            break;
          case 1:
          case 'day':
            viewMode = 1;
            break;
          case 0:
          case 'hour':
            viewMode = 0;
            break;
        }
        return viewMode;
      },
      headTemplate: '<thead>' + '<tr>' + '<th class="prev"><i class="{iconType} {leftArrow}"/></th>' + '<th colspan="5" class="switch"></th>' + '<th class="next"><i class="{iconType} {rightArrow}"/></th>' + '</tr>' + '</thead>',
      headTemplateV3: '<thead>' + '<tr>' + '<th class="prev"><span class="{iconType} {leftArrow}"></span> </th>' + '<th colspan="5" class="switch"></th>' + '<th class="next"><span class="{iconType} {rightArrow}"></span> </th>' + '</tr>' + '</thead>',
      contTemplate: '<tbody><tr><td colspan="7"></td></tr></tbody>',
      footTemplate: '<tfoot><tr><th colspan="7" class="today"></th></tr></tfoot>'
    };
    DPGlobal.template = '<div class="datetimepicker">' + '<div class="datetimepicker-minutes">' + '<table class=" table-condensed">' + DPGlobal.headTemplate + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-hours">' + '<table class=" table-condensed">' + DPGlobal.headTemplate + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-days">' + '<table class=" table-condensed">' + DPGlobal.headTemplate + '<tbody></tbody>' + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-months">' + '<table class="table-condensed">' + DPGlobal.headTemplate + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-years">' + '<table class="table-condensed">' + DPGlobal.headTemplate + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '</div>';
    DPGlobal.templateV3 = '<div class="datetimepicker">' + '<div class="datetimepicker-minutes">' + '<table class=" table-condensed">' + DPGlobal.headTemplateV3 + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-hours">' + '<table class=" table-condensed">' + DPGlobal.headTemplateV3 + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-days">' + '<table class=" table-condensed">' + DPGlobal.headTemplateV3 + '<tbody></tbody>' + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-months">' + '<table class="table-condensed">' + DPGlobal.headTemplateV3 + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '<div class="datetimepicker-years">' + '<table class="table-condensed">' + DPGlobal.headTemplateV3 + DPGlobal.contTemplate + DPGlobal.footTemplate + '</table>' + '</div>' + '</div>';
    $.fn.datetimepicker.DPGlobal = DPGlobal;
    $.fn.datetimepicker.noConflict = function() {
      $.fn.datetimepicker = old;
      return this;
    };
    $(document).on('focus.datetimepicker.data-api click.datetimepicker.data-api', '[data-provide="datetimepicker"]', function(e) {
      var $this = $(this);
      if ($this.data('datetimepicker'))
        return;
      e.preventDefault();
      $this.datetimepicker('show');
    });
    $(function() {
      $('[data-provide="datetimepicker-inline"]').datetimepicker();
    });
  }(window.jQuery);
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("21", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  ;
  (function($) {
    $.fn.datetimepicker.dates['zh-CN'] = {
      days: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"],
      daysShort: ["周日", "周一", "周二", "周三", "周四", "周五", "周六", "周日"],
      daysMin: ["日", "一", "二", "三", "四", "五", "六", "日"],
      months: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
      monthsShort: ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"],
      today: "今天",
      suffix: [],
      meridiem: ["上午", "下午"]
    };
  }(jQuery));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("16", ["18", "19", "1a", "1c", "1d", "1f", "20", "21"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('18');
  req('19');
  req('1a');
  req('1c');
  req('1d');
  req('1f');
  req('20');
  req('21');
  global.define = __define;
  return module.exports;
});

})
(function(factory) {
  factory();
});