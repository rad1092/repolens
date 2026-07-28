"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/semver/internal/constants.js
var require_constants = __commonJS({
  "node_modules/semver/internal/constants.js"(exports2, module2) {
    "use strict";
    var SEMVER_SPEC_VERSION = "2.0.0";
    var MAX_LENGTH = 256;
    var MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || /* istanbul ignore next */
    9007199254740991;
    var MAX_SAFE_COMPONENT_LENGTH = 16;
    var MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
    var RELEASE_TYPES = [
      "major",
      "premajor",
      "minor",
      "preminor",
      "patch",
      "prepatch",
      "prerelease"
    ];
    module2.exports = {
      MAX_LENGTH,
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_SAFE_INTEGER,
      RELEASE_TYPES,
      SEMVER_SPEC_VERSION,
      FLAG_INCLUDE_PRERELEASE: 1,
      FLAG_LOOSE: 2
    };
  }
});

// node_modules/semver/internal/debug.js
var require_debug = __commonJS({
  "node_modules/semver/internal/debug.js"(exports2, module2) {
    "use strict";
    var debug = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {
    };
    module2.exports = debug;
  }
});

// node_modules/semver/internal/re.js
var require_re = __commonJS({
  "node_modules/semver/internal/re.js"(exports2, module2) {
    "use strict";
    var {
      MAX_SAFE_COMPONENT_LENGTH,
      MAX_SAFE_BUILD_LENGTH,
      MAX_LENGTH
    } = require_constants();
    var debug = require_debug();
    exports2 = module2.exports = {};
    var re = exports2.re = [];
    var safeRe = exports2.safeRe = [];
    var src = exports2.src = [];
    var safeSrc = exports2.safeSrc = [];
    var t = exports2.t = {};
    var R = 0;
    var LETTERDASHNUMBER = "[a-zA-Z0-9-]";
    var safeRegexReplacements = [
      ["\\s", 1],
      ["\\d", MAX_LENGTH],
      [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
    ];
    var makeSafeRegex = (value) => {
      for (const [token, max] of safeRegexReplacements) {
        value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
      }
      return value;
    };
    var createToken = (name, value, isGlobal) => {
      const safe = makeSafeRegex(value);
      const index = R++;
      debug(name, index, value);
      t[name] = index;
      src[index] = value;
      safeSrc[index] = safe;
      re[index] = new RegExp(value, isGlobal ? "g" : void 0);
      safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
    };
    createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
    createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
    createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
    createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
    createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
    createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
    createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
    createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
    createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
    createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
    createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
    createToken("FULL", `^${src[t.FULLPLAIN]}$`);
    createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
    createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
    createToken("GTLT", "((?:<|>)?=?)");
    createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
    createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
    createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
    createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
    createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COERCEPLAIN", `${"(^|[^\\d])(\\d{1,"}${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
    createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
    createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
    createToken("COERCERTL", src[t.COERCE], true);
    createToken("COERCERTLFULL", src[t.COERCEFULL], true);
    createToken("LONETILDE", "(?:~>?)");
    createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
    exports2.tildeTrimReplace = "$1~";
    createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
    createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("LONECARET", "(?:\\^)");
    createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
    exports2.caretTrimReplace = "$1^";
    createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
    createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
    createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
    createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
    createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
    exports2.comparatorTrimReplace = "$1$2$3";
    createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
    createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
    createToken("STAR", "(<|>)?=?\\s*\\*");
    createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
    createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
  }
});

// node_modules/semver/internal/parse-options.js
var require_parse_options = __commonJS({
  "node_modules/semver/internal/parse-options.js"(exports2, module2) {
    "use strict";
    var looseOption = Object.freeze({ loose: true });
    var emptyOpts = Object.freeze({});
    var parseOptions = (options) => {
      if (!options) {
        return emptyOpts;
      }
      if (typeof options !== "object") {
        return looseOption;
      }
      return options;
    };
    module2.exports = parseOptions;
  }
});

// node_modules/semver/internal/identifiers.js
var require_identifiers = __commonJS({
  "node_modules/semver/internal/identifiers.js"(exports2, module2) {
    "use strict";
    var numeric2 = /^[0-9]+$/;
    var compareIdentifiers = (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return a === b ? 0 : a < b ? -1 : 1;
      }
      const anum = numeric2.test(a);
      const bnum = numeric2.test(b);
      if (anum && bnum) {
        a = +a;
        b = +b;
      }
      return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
    };
    var rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
    module2.exports = {
      compareIdentifiers,
      rcompareIdentifiers
    };
  }
});

// node_modules/semver/classes/semver.js
var require_semver = __commonJS({
  "node_modules/semver/classes/semver.js"(exports2, module2) {
    "use strict";
    var debug = require_debug();
    var { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
    var { safeRe: re, t } = require_re();
    var parseOptions = require_parse_options();
    var { compareIdentifiers } = require_identifiers();
    var isPrereleaseIdentifier = (prerelease, identifier) => {
      const identifiers = identifier.split(".");
      if (identifiers.length > prerelease.length) {
        return false;
      }
      for (let i = 0; i < identifiers.length; i++) {
        if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
          return false;
        }
      }
      return true;
    };
    var SemVer = class _SemVer {
      constructor(version, options) {
        options = parseOptions(options);
        if (version instanceof _SemVer) {
          if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) {
            return version;
          } else {
            version = version.version;
          }
        } else if (typeof version !== "string") {
          throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
        }
        if (version.length > MAX_LENGTH) {
          throw new TypeError(
            `version is longer than ${MAX_LENGTH} characters`
          );
        }
        debug("SemVer", version, options);
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
        if (!m) {
          throw new TypeError(`Invalid Version: ${version}`);
        }
        this.raw = version;
        this.major = +m[1];
        this.minor = +m[2];
        this.patch = +m[3];
        if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
          throw new TypeError("Invalid major version");
        }
        if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
          throw new TypeError("Invalid minor version");
        }
        if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
          throw new TypeError("Invalid patch version");
        }
        if (!m[4]) {
          this.prerelease = [];
        } else {
          this.prerelease = m[4].split(".").map((id) => {
            if (/^[0-9]+$/.test(id)) {
              const num = +id;
              if (num >= 0 && num < MAX_SAFE_INTEGER) {
                return num;
              }
            }
            return id;
          });
        }
        this.build = m[5] ? m[5].split(".") : [];
        this.format();
      }
      format() {
        this.version = `${this.major}.${this.minor}.${this.patch}`;
        if (this.prerelease.length) {
          this.version += `-${this.prerelease.join(".")}`;
        }
        return this.version;
      }
      toString() {
        return this.version;
      }
      compare(other) {
        debug("SemVer.compare", this.version, this.options, other);
        if (!(other instanceof _SemVer)) {
          if (typeof other === "string" && other === this.version) {
            return 0;
          }
          other = new _SemVer(other, this.options);
        }
        if (other.version === this.version) {
          return 0;
        }
        return this.compareMain(other) || this.comparePre(other);
      }
      compareMain(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.major < other.major) {
          return -1;
        }
        if (this.major > other.major) {
          return 1;
        }
        if (this.minor < other.minor) {
          return -1;
        }
        if (this.minor > other.minor) {
          return 1;
        }
        if (this.patch < other.patch) {
          return -1;
        }
        if (this.patch > other.patch) {
          return 1;
        }
        return 0;
      }
      comparePre(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        if (this.prerelease.length && !other.prerelease.length) {
          return -1;
        } else if (!this.prerelease.length && other.prerelease.length) {
          return 1;
        } else if (!this.prerelease.length && !other.prerelease.length) {
          return 0;
        }
        let i = 0;
        do {
          const a = this.prerelease[i];
          const b = other.prerelease[i];
          debug("prerelease compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      compareBuild(other) {
        if (!(other instanceof _SemVer)) {
          other = new _SemVer(other, this.options);
        }
        let i = 0;
        do {
          const a = this.build[i];
          const b = other.build[i];
          debug("build compare", i, a, b);
          if (a === void 0 && b === void 0) {
            return 0;
          } else if (b === void 0) {
            return 1;
          } else if (a === void 0) {
            return -1;
          } else if (a === b) {
            continue;
          } else {
            return compareIdentifiers(a, b);
          }
        } while (++i);
      }
      // preminor will bump the version up to the next minor release, and immediately
      // down to pre-release. premajor and prepatch work the same way.
      inc(release, identifier, identifierBase) {
        if (release.startsWith("pre")) {
          if (!identifier && identifierBase === false) {
            throw new Error("invalid increment argument: identifier is empty");
          }
          if (identifier) {
            const match2 = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
            if (!match2 || match2[1] !== identifier) {
              throw new Error(`invalid identifier: ${identifier}`);
            }
          }
        }
        switch (release) {
          case "premajor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor = 0;
            this.major++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "preminor":
            this.prerelease.length = 0;
            this.patch = 0;
            this.minor++;
            this.inc("pre", identifier, identifierBase);
            break;
          case "prepatch":
            this.prerelease.length = 0;
            this.inc("patch", identifier, identifierBase);
            this.inc("pre", identifier, identifierBase);
            break;
          // If the input is a non-prerelease version, this acts the same as
          // prepatch.
          case "prerelease":
            if (this.prerelease.length === 0) {
              this.inc("patch", identifier, identifierBase);
            }
            this.inc("pre", identifier, identifierBase);
            break;
          case "release":
            if (this.prerelease.length === 0) {
              throw new Error(`version ${this.raw} is not a prerelease`);
            }
            this.prerelease.length = 0;
            break;
          case "major":
            if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) {
              this.major++;
            }
            this.minor = 0;
            this.patch = 0;
            this.prerelease = [];
            break;
          case "minor":
            if (this.patch !== 0 || this.prerelease.length === 0) {
              this.minor++;
            }
            this.patch = 0;
            this.prerelease = [];
            break;
          case "patch":
            if (this.prerelease.length === 0) {
              this.patch++;
            }
            this.prerelease = [];
            break;
          // This probably shouldn't be used publicly.
          // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
          case "pre": {
            const base = Number(identifierBase) ? 1 : 0;
            if (this.prerelease.length === 0) {
              this.prerelease = [base];
            } else {
              let i = this.prerelease.length;
              while (--i >= 0) {
                if (typeof this.prerelease[i] === "number") {
                  this.prerelease[i]++;
                  i = -2;
                }
              }
              if (i === -1) {
                if (identifier === this.prerelease.join(".") && identifierBase === false) {
                  throw new Error("invalid increment argument: identifier already exists");
                }
                this.prerelease.push(base);
              }
            }
            if (identifier) {
              let prerelease = [identifier, base];
              if (identifierBase === false) {
                prerelease = [identifier];
              }
              if (isPrereleaseIdentifier(this.prerelease, identifier)) {
                const prereleaseBase = this.prerelease[identifier.split(".").length];
                if (isNaN(prereleaseBase)) {
                  this.prerelease = prerelease;
                }
              } else {
                this.prerelease = prerelease;
              }
            }
            break;
          }
          default:
            throw new Error(`invalid increment argument: ${release}`);
        }
        this.raw = this.format();
        if (this.build.length) {
          this.raw += `+${this.build.join(".")}`;
        }
        return this;
      }
    };
    module2.exports = SemVer;
  }
});

// node_modules/semver/functions/parse.js
var require_parse = __commonJS({
  "node_modules/semver/functions/parse.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = (version, options, throwErrors = false) => {
      if (version instanceof SemVer) {
        return version;
      }
      try {
        return new SemVer(version, options);
      } catch (er) {
        if (!throwErrors) {
          return null;
        }
        throw er;
      }
    };
    module2.exports = parse;
  }
});

// node_modules/semver/functions/valid.js
var require_valid = __commonJS({
  "node_modules/semver/functions/valid.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var valid = (version, options) => {
      const v = parse(version, options);
      return v ? v.version : null;
    };
    module2.exports = valid;
  }
});

// node_modules/semver/functions/clean.js
var require_clean = __commonJS({
  "node_modules/semver/functions/clean.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var clean = (version, options) => {
      const s = parse(version.trim().replace(/^[=v]+/, ""), options);
      return s ? s.version : null;
    };
    module2.exports = clean;
  }
});

// node_modules/semver/functions/inc.js
var require_inc = __commonJS({
  "node_modules/semver/functions/inc.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var inc = (version, release, options, identifier, identifierBase) => {
      if (typeof options === "string") {
        identifierBase = identifier;
        identifier = options;
        options = void 0;
      }
      try {
        return new SemVer(
          version instanceof SemVer ? version.version : version,
          options
        ).inc(release, identifier, identifierBase).version;
      } catch (er) {
        return null;
      }
    };
    module2.exports = inc;
  }
});

// node_modules/semver/functions/diff.js
var require_diff = __commonJS({
  "node_modules/semver/functions/diff.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var diff = (version1, version2) => {
      const v1 = parse(version1, null, true);
      const v2 = parse(version2, null, true);
      const comparison = v1.compare(v2);
      if (comparison === 0) {
        return null;
      }
      const v1Higher = comparison > 0;
      const highVersion = v1Higher ? v1 : v2;
      const lowVersion = v1Higher ? v2 : v1;
      const highHasPre = !!highVersion.prerelease.length;
      const lowHasPre = !!lowVersion.prerelease.length;
      if (lowHasPre && !highHasPre) {
        if (!lowVersion.patch && !lowVersion.minor) {
          return "major";
        }
        if (lowVersion.compareMain(highVersion) === 0) {
          if (lowVersion.minor && !lowVersion.patch) {
            return "minor";
          }
          return "patch";
        }
      }
      const prefix = highHasPre ? "pre" : "";
      if (v1.major !== v2.major) {
        return prefix + "major";
      }
      if (v1.minor !== v2.minor) {
        return prefix + "minor";
      }
      if (v1.patch !== v2.patch) {
        return prefix + "patch";
      }
      return "prerelease";
    };
    module2.exports = diff;
  }
});

// node_modules/semver/functions/major.js
var require_major = __commonJS({
  "node_modules/semver/functions/major.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var major = (a, loose) => new SemVer(a, loose).major;
    module2.exports = major;
  }
});

// node_modules/semver/functions/minor.js
var require_minor = __commonJS({
  "node_modules/semver/functions/minor.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var minor = (a, loose) => new SemVer(a, loose).minor;
    module2.exports = minor;
  }
});

// node_modules/semver/functions/patch.js
var require_patch = __commonJS({
  "node_modules/semver/functions/patch.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var patch = (a, loose) => new SemVer(a, loose).patch;
    module2.exports = patch;
  }
});

// node_modules/semver/functions/prerelease.js
var require_prerelease = __commonJS({
  "node_modules/semver/functions/prerelease.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var prerelease = (version, options) => {
      const parsed = parse(version, options);
      return parsed && parsed.prerelease.length ? parsed.prerelease : null;
    };
    module2.exports = prerelease;
  }
});

// node_modules/semver/functions/compare.js
var require_compare = __commonJS({
  "node_modules/semver/functions/compare.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
    module2.exports = compare;
  }
});

// node_modules/semver/functions/rcompare.js
var require_rcompare = __commonJS({
  "node_modules/semver/functions/rcompare.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var rcompare = (a, b, loose) => compare(b, a, loose);
    module2.exports = rcompare;
  }
});

// node_modules/semver/functions/compare-loose.js
var require_compare_loose = __commonJS({
  "node_modules/semver/functions/compare-loose.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var compareLoose = (a, b) => compare(a, b, true);
    module2.exports = compareLoose;
  }
});

// node_modules/semver/functions/compare-build.js
var require_compare_build = __commonJS({
  "node_modules/semver/functions/compare-build.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var compareBuild = (a, b, loose) => {
      const versionA = new SemVer(a, loose);
      const versionB = new SemVer(b, loose);
      return versionA.compare(versionB) || versionA.compareBuild(versionB);
    };
    module2.exports = compareBuild;
  }
});

// node_modules/semver/functions/sort.js
var require_sort = __commonJS({
  "node_modules/semver/functions/sort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
    module2.exports = sort;
  }
});

// node_modules/semver/functions/rsort.js
var require_rsort = __commonJS({
  "node_modules/semver/functions/rsort.js"(exports2, module2) {
    "use strict";
    var compareBuild = require_compare_build();
    var rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
    module2.exports = rsort;
  }
});

// node_modules/semver/functions/gt.js
var require_gt = __commonJS({
  "node_modules/semver/functions/gt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gt = (a, b, loose) => compare(a, b, loose) > 0;
    module2.exports = gt;
  }
});

// node_modules/semver/functions/lt.js
var require_lt = __commonJS({
  "node_modules/semver/functions/lt.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lt = (a, b, loose) => compare(a, b, loose) < 0;
    module2.exports = lt;
  }
});

// node_modules/semver/functions/eq.js
var require_eq = __commonJS({
  "node_modules/semver/functions/eq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var eq = (a, b, loose) => compare(a, b, loose) === 0;
    module2.exports = eq;
  }
});

// node_modules/semver/functions/neq.js
var require_neq = __commonJS({
  "node_modules/semver/functions/neq.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var neq = (a, b, loose) => compare(a, b, loose) !== 0;
    module2.exports = neq;
  }
});

// node_modules/semver/functions/gte.js
var require_gte = __commonJS({
  "node_modules/semver/functions/gte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var gte2 = (a, b, loose) => compare(a, b, loose) >= 0;
    module2.exports = gte2;
  }
});

// node_modules/semver/functions/lte.js
var require_lte = __commonJS({
  "node_modules/semver/functions/lte.js"(exports2, module2) {
    "use strict";
    var compare = require_compare();
    var lte2 = (a, b, loose) => compare(a, b, loose) <= 0;
    module2.exports = lte2;
  }
});

// node_modules/semver/functions/cmp.js
var require_cmp = __commonJS({
  "node_modules/semver/functions/cmp.js"(exports2, module2) {
    "use strict";
    var eq = require_eq();
    var neq = require_neq();
    var gt = require_gt();
    var gte2 = require_gte();
    var lt = require_lt();
    var lte2 = require_lte();
    var cmp = (a, op, b, loose) => {
      switch (op) {
        case "===":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a === b;
        case "!==":
          if (typeof a === "object") {
            a = a.version;
          }
          if (typeof b === "object") {
            b = b.version;
          }
          return a !== b;
        case "":
        case "=":
        case "==":
          return eq(a, b, loose);
        case "!=":
          return neq(a, b, loose);
        case ">":
          return gt(a, b, loose);
        case ">=":
          return gte2(a, b, loose);
        case "<":
          return lt(a, b, loose);
        case "<=":
          return lte2(a, b, loose);
        default:
          throw new TypeError(`Invalid operator: ${op}`);
      }
    };
    module2.exports = cmp;
  }
});

// node_modules/semver/functions/coerce.js
var require_coerce = __commonJS({
  "node_modules/semver/functions/coerce.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var parse = require_parse();
    var { safeRe: re, t } = require_re();
    var coerce = (version, options) => {
      if (version instanceof SemVer) {
        return version;
      }
      if (typeof version === "number") {
        version = String(version);
      }
      if (typeof version !== "string") {
        return null;
      }
      options = options || {};
      let match2 = null;
      if (!options.rtl) {
        match2 = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
      } else {
        const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
        let next;
        while ((next = coerceRtlRegex.exec(version)) && (!match2 || match2.index + match2[0].length !== version.length)) {
          if (!match2 || next.index + next[0].length !== match2.index + match2[0].length) {
            match2 = next;
          }
          coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
        }
        coerceRtlRegex.lastIndex = -1;
      }
      if (match2 === null) {
        return null;
      }
      const major = match2[2];
      const minor = match2[3] || "0";
      const patch = match2[4] || "0";
      const prerelease = options.includePrerelease && match2[5] ? `-${match2[5]}` : "";
      const build = options.includePrerelease && match2[6] ? `+${match2[6]}` : "";
      return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
    };
    module2.exports = coerce;
  }
});

// node_modules/semver/functions/truncate.js
var require_truncate = __commonJS({
  "node_modules/semver/functions/truncate.js"(exports2, module2) {
    "use strict";
    var parse = require_parse();
    var constants = require_constants();
    var SemVer = require_semver();
    var truncate = (version, truncation, options) => {
      if (!constants.RELEASE_TYPES.includes(truncation)) {
        return null;
      }
      const clonedVersion = cloneInputVersion(version, options);
      return clonedVersion && doTruncation(clonedVersion, truncation);
    };
    var cloneInputVersion = (version, options) => {
      const versionStringToParse = version instanceof SemVer ? version.version : version;
      return parse(versionStringToParse, options);
    };
    var doTruncation = (version, truncation) => {
      if (isPrerelease(truncation)) {
        return version.version;
      }
      version.prerelease = [];
      switch (truncation) {
        case "major":
          version.minor = 0;
          version.patch = 0;
          break;
        case "minor":
          version.patch = 0;
          break;
      }
      return version.format();
    };
    var isPrerelease = (type) => {
      return type.startsWith("pre");
    };
    module2.exports = truncate;
  }
});

// node_modules/semver/internal/lrucache.js
var require_lrucache = __commonJS({
  "node_modules/semver/internal/lrucache.js"(exports2, module2) {
    "use strict";
    var LRUCache = class {
      constructor() {
        this.max = 1e3;
        this.map = /* @__PURE__ */ new Map();
      }
      get(key) {
        const value = this.map.get(key);
        if (value === void 0) {
          return void 0;
        } else {
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }
      }
      delete(key) {
        return this.map.delete(key);
      }
      set(key, value) {
        const deleted = this.delete(key);
        if (!deleted && value !== void 0) {
          if (this.map.size >= this.max) {
            const firstKey = this.map.keys().next().value;
            this.delete(firstKey);
          }
          this.map.set(key, value);
        }
        return this;
      }
    };
    module2.exports = LRUCache;
  }
});

// node_modules/semver/classes/range.js
var require_range = __commonJS({
  "node_modules/semver/classes/range.js"(exports2, module2) {
    "use strict";
    var SPACE_CHARACTERS = /\s+/g;
    var Range = class _Range {
      constructor(range2, options) {
        options = parseOptions(options);
        if (range2 instanceof _Range) {
          if (range2.loose === !!options.loose && range2.includePrerelease === !!options.includePrerelease) {
            return range2;
          } else {
            return new _Range(range2.raw, options);
          }
        }
        if (range2 instanceof Comparator) {
          this.raw = range2.value;
          this.set = [[range2]];
          this.formatted = void 0;
          return this;
        }
        this.options = options;
        this.loose = !!options.loose;
        this.includePrerelease = !!options.includePrerelease;
        this.raw = range2.trim().replace(SPACE_CHARACTERS, " ");
        this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
        if (!this.set.length) {
          throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
        }
        if (this.set.length > 1) {
          const first = this.set[0];
          this.set = this.set.filter((c) => !isNullSet(c[0]));
          if (this.set.length === 0) {
            this.set = [first];
          } else if (this.set.length > 1) {
            for (const c of this.set) {
              if (c.length === 1 && isAny(c[0])) {
                this.set = [c];
                break;
              }
            }
          }
        }
        this.formatted = void 0;
      }
      get range() {
        if (this.formatted === void 0) {
          this.formatted = "";
          for (let i = 0; i < this.set.length; i++) {
            if (i > 0) {
              this.formatted += "||";
            }
            const comps = this.set[i];
            for (let k = 0; k < comps.length; k++) {
              if (k > 0) {
                this.formatted += " ";
              }
              this.formatted += comps[k].toString().trim();
            }
          }
        }
        return this.formatted;
      }
      format() {
        return this.range;
      }
      toString() {
        return this.range;
      }
      parseRange(range2) {
        range2 = range2.replace(BUILDSTRIPRE, "");
        const memoOpts = (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE);
        const memoKey = memoOpts + ":" + range2;
        const cached = cache.get(memoKey);
        if (cached) {
          return cached;
        }
        const loose = this.options.loose;
        const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
        range2 = range2.replace(hr, hyphenReplace(this.options.includePrerelease));
        debug("hyphen replace", range2);
        range2 = range2.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
        debug("comparator trim", range2);
        range2 = range2.replace(re[t.TILDETRIM], tildeTrimReplace);
        debug("tilde trim", range2);
        range2 = range2.replace(re[t.CARETTRIM], caretTrimReplace);
        debug("caret trim", range2);
        let rangeList = range2.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
        if (loose) {
          rangeList = rangeList.filter((comp) => {
            debug("loose invalid filter", comp, this.options);
            return !!comp.match(re[t.COMPARATORLOOSE]);
          });
        }
        debug("range list", rangeList);
        const rangeMap = /* @__PURE__ */ new Map();
        const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
        for (const comp of comparators) {
          if (isNullSet(comp)) {
            return [comp];
          }
          rangeMap.set(comp.value, comp);
        }
        if (rangeMap.size > 1 && rangeMap.has("")) {
          rangeMap.delete("");
        }
        const result = [...rangeMap.values()];
        cache.set(memoKey, result);
        return result;
      }
      intersects(range2, options) {
        if (!(range2 instanceof _Range)) {
          throw new TypeError("a Range is required");
        }
        return this.set.some((thisComparators) => {
          return isSatisfiable(thisComparators, options) && range2.set.some((rangeComparators) => {
            return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options);
              });
            });
          });
        });
      }
      // if ANY of the sets match ALL of its comparators, then pass
      test(version) {
        if (!version) {
          return false;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        for (let i = 0; i < this.set.length; i++) {
          if (testSet(this.set[i], version, this.options)) {
            return true;
          }
        }
        return false;
      }
    };
    module2.exports = Range;
    var LRU = require_lrucache();
    var cache = new LRU();
    var parseOptions = require_parse_options();
    var Comparator = require_comparator();
    var debug = require_debug();
    var SemVer = require_semver();
    var {
      safeRe: re,
      src,
      t,
      comparatorTrimReplace,
      tildeTrimReplace,
      caretTrimReplace
    } = require_re();
    var { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
    var BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
    var isNullSet = (c) => c.value === "<0.0.0-0";
    var isAny = (c) => c.value === "";
    var isSatisfiable = (comparators, options) => {
      let result = true;
      const remainingComparators = comparators.slice();
      let testComparator = remainingComparators.pop();
      while (result && remainingComparators.length) {
        result = remainingComparators.every((otherComparator) => {
          return testComparator.intersects(otherComparator, options);
        });
        testComparator = remainingComparators.pop();
      }
      return result;
    };
    var parseComparator = (comp, options) => {
      comp = comp.replace(re[t.BUILD], "");
      debug("comp", comp, options);
      comp = replaceCarets(comp, options);
      debug("caret", comp);
      comp = replaceTildes(comp, options);
      debug("tildes", comp);
      comp = replaceXRanges(comp, options);
      debug("xrange", comp);
      comp = replaceStars(comp, options);
      debug("stars", comp);
      return comp;
    };
    var isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
    var invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
    var replaceTildes = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
    };
    var replaceTilde = (comp, options) => {
      const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("tilde", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
        } else if (pr) {
          debug("replaceTilde pr", pr);
          ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
        } else {
          ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
        }
        debug("tilde return", ret);
        return ret;
      });
    };
    var replaceCarets = (comp, options) => {
      return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
    };
    var replaceCaret = (comp, options) => {
      debug("caret", comp, options);
      const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
      const z = options.includePrerelease ? "-0" : "";
      return comp.replace(r, (_, M, m, p, pr) => {
        debug("caret", comp, _, M, m, p, pr);
        let ret;
        if (isX(M)) {
          ret = "";
        } else if (isX(m)) {
          ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
        } else if (isX(p)) {
          if (M === "0") {
            ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
          } else {
            ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
          }
        } else if (pr) {
          debug("replaceCaret pr", pr);
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
          }
        } else {
          debug("no pr");
          if (M === "0") {
            if (m === "0") {
              ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
            } else {
              ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
            }
          } else {
            ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
          }
        }
        debug("caret return", ret);
        return ret;
      });
    };
    var replaceXRanges = (comp, options) => {
      debug("replaceXRanges", comp, options);
      return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
    };
    var replaceXRange = (comp, options) => {
      comp = comp.trim();
      const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
      return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
        debug("xRange", comp, ret, gtlt, M, m, p, pr);
        if (invalidXRangeOrder(M, m, p)) {
          return comp;
        }
        const xM = isX(M);
        const xm = xM || isX(m);
        const xp = xm || isX(p);
        const anyX = xp;
        if (gtlt === "=" && anyX) {
          gtlt = "";
        }
        pr = options.includePrerelease ? "-0" : "";
        if (xM) {
          if (gtlt === ">" || gtlt === "<") {
            ret = "<0.0.0-0";
          } else {
            ret = "*";
          }
        } else if (gtlt && anyX) {
          if (xm) {
            m = 0;
          }
          p = 0;
          if (gtlt === ">") {
            gtlt = ">=";
            if (xm) {
              M = +M + 1;
              m = 0;
              p = 0;
            } else {
              m = +m + 1;
              p = 0;
            }
          } else if (gtlt === "<=") {
            gtlt = "<";
            if (xm) {
              M = +M + 1;
            } else {
              m = +m + 1;
            }
          }
          if (gtlt === "<") {
            pr = "-0";
          }
          ret = `${gtlt + M}.${m}.${p}${pr}`;
        } else if (xm) {
          ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
        } else if (xp) {
          ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
        }
        debug("xRange return", ret);
        return ret;
      });
    };
    var replaceStars = (comp, options) => {
      debug("replaceStars", comp, options);
      return comp.trim().replace(re[t.STAR], "");
    };
    var replaceGTE0 = (comp, options) => {
      debug("replaceGTE0", comp, options);
      return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
    };
    var hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
      if (isX(fM)) {
        from = "";
      } else if (isX(fm)) {
        from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
      } else if (isX(fp)) {
        from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
      } else if (fpr) {
        from = `>=${from}`;
      } else {
        from = `>=${from}${incPr ? "-0" : ""}`;
      }
      if (isX(tM)) {
        to = "";
      } else if (isX(tm)) {
        to = `<${+tM + 1}.0.0-0`;
      } else if (isX(tp)) {
        to = `<${tM}.${+tm + 1}.0-0`;
      } else if (tpr) {
        to = `<=${tM}.${tm}.${tp}-${tpr}`;
      } else if (incPr) {
        to = `<${tM}.${tm}.${+tp + 1}-0`;
      } else {
        to = `<=${to}`;
      }
      return `${from} ${to}`.trim();
    };
    var testSet = (set, version, options) => {
      for (let i = 0; i < set.length; i++) {
        if (!set[i].test(version)) {
          return false;
        }
      }
      if (version.prerelease.length && !options.includePrerelease) {
        for (let i = 0; i < set.length; i++) {
          debug(set[i].semver);
          if (set[i].semver === Comparator.ANY) {
            continue;
          }
          if (set[i].semver.prerelease.length > 0) {
            const allowed = set[i].semver;
            if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) {
              return true;
            }
          }
        }
        return false;
      }
      return true;
    };
  }
});

// node_modules/semver/classes/comparator.js
var require_comparator = __commonJS({
  "node_modules/semver/classes/comparator.js"(exports2, module2) {
    "use strict";
    var ANY = Symbol("SemVer ANY");
    var Comparator = class _Comparator {
      static get ANY() {
        return ANY;
      }
      constructor(comp, options) {
        options = parseOptions(options);
        if (comp instanceof _Comparator) {
          if (comp.loose === !!options.loose) {
            return comp;
          } else {
            comp = comp.value;
          }
        }
        comp = comp.trim().split(/\s+/).join(" ");
        debug("comparator", comp, options);
        this.options = options;
        this.loose = !!options.loose;
        this.parse(comp);
        if (this.semver === ANY) {
          this.value = "";
        } else {
          this.value = this.operator + this.semver.version;
        }
        debug("comp", this);
      }
      parse(comp) {
        const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
        const m = comp.match(r);
        if (!m) {
          throw new TypeError(`Invalid comparator: ${comp}`);
        }
        this.operator = m[1] !== void 0 ? m[1] : "";
        if (this.operator === "=") {
          this.operator = "";
        }
        if (!m[2]) {
          this.semver = ANY;
        } else {
          this.semver = new SemVer(m[2], this.options.loose);
        }
      }
      toString() {
        return this.value;
      }
      test(version) {
        debug("Comparator.test", version, this.options.loose);
        if (this.semver === ANY || version === ANY) {
          return true;
        }
        if (typeof version === "string") {
          try {
            version = new SemVer(version, this.options);
          } catch (er) {
            return false;
          }
        }
        return cmp(version, this.operator, this.semver, this.options);
      }
      intersects(comp, options) {
        if (!(comp instanceof _Comparator)) {
          throw new TypeError("a Comparator is required");
        }
        if (this.operator === "") {
          if (this.value === "") {
            return true;
          }
          return new Range(comp.value, options).test(this.value);
        } else if (comp.operator === "") {
          if (comp.value === "") {
            return true;
          }
          return new Range(this.value, options).test(comp.semver);
        }
        options = parseOptions(options);
        if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) {
          return false;
        }
        if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) {
          return false;
        }
        if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
          return true;
        }
        if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
          return true;
        }
        if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) {
          return true;
        }
        if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) {
          return true;
        }
        if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) {
          return true;
        }
        return false;
      }
    };
    module2.exports = Comparator;
    var parseOptions = require_parse_options();
    var { safeRe: re, t } = require_re();
    var cmp = require_cmp();
    var debug = require_debug();
    var SemVer = require_semver();
    var Range = require_range();
  }
});

// node_modules/semver/functions/satisfies.js
var require_satisfies = __commonJS({
  "node_modules/semver/functions/satisfies.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var satisfies = (version, range2, options) => {
      try {
        range2 = new Range(range2, options);
      } catch (er) {
        return false;
      }
      return range2.test(version);
    };
    module2.exports = satisfies;
  }
});

// node_modules/semver/ranges/to-comparators.js
var require_to_comparators = __commonJS({
  "node_modules/semver/ranges/to-comparators.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var toComparators = (range2, options) => new Range(range2, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
    module2.exports = toComparators;
  }
});

// node_modules/semver/ranges/max-satisfying.js
var require_max_satisfying = __commonJS({
  "node_modules/semver/ranges/max-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var maxSatisfying = (versions, range2, options) => {
      let max = null;
      let maxSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range2, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!max || maxSV.compare(v) === -1) {
            max = v;
            maxSV = new SemVer(max, options);
          }
        }
      });
      return max;
    };
    module2.exports = maxSatisfying;
  }
});

// node_modules/semver/ranges/min-satisfying.js
var require_min_satisfying = __commonJS({
  "node_modules/semver/ranges/min-satisfying.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var minSatisfying = (versions, range2, options) => {
      let min = null;
      let minSV = null;
      let rangeObj = null;
      try {
        rangeObj = new Range(range2, options);
      } catch (er) {
        return null;
      }
      versions.forEach((v) => {
        if (rangeObj.test(v)) {
          if (!min || minSV.compare(v) === 1) {
            min = v;
            minSV = new SemVer(min, options);
          }
        }
      });
      return min;
    };
    module2.exports = minSatisfying;
  }
});

// node_modules/semver/ranges/min-version.js
var require_min_version = __commonJS({
  "node_modules/semver/ranges/min-version.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Range = require_range();
    var gt = require_gt();
    var minVersion = (range2, loose) => {
      range2 = new Range(range2, loose);
      let minver = new SemVer("0.0.0");
      if (range2.test(minver)) {
        return minver;
      }
      minver = new SemVer("0.0.0-0");
      if (range2.test(minver)) {
        return minver;
      }
      minver = null;
      for (let i = 0; i < range2.set.length; ++i) {
        const comparators = range2.set[i];
        let setMin = null;
        comparators.forEach((comparator) => {
          const compver = new SemVer(comparator.semver.version);
          switch (comparator.operator) {
            case ">":
              if (compver.prerelease.length === 0) {
                compver.patch++;
              } else {
                compver.prerelease.push(0);
              }
              compver.raw = compver.format();
            /* fallthrough */
            case "":
            case ">=":
              if (!setMin || gt(compver, setMin)) {
                setMin = compver;
              }
              break;
            case "<":
            case "<=":
              break;
            /* istanbul ignore next */
            default:
              throw new Error(`Unexpected operation: ${comparator.operator}`);
          }
        });
        if (setMin && (!minver || gt(minver, setMin))) {
          minver = setMin;
        }
      }
      if (minver && range2.test(minver)) {
        return minver;
      }
      return null;
    };
    module2.exports = minVersion;
  }
});

// node_modules/semver/ranges/valid.js
var require_valid2 = __commonJS({
  "node_modules/semver/ranges/valid.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var validRange = (range2, options) => {
      try {
        return new Range(range2, options).range || "*";
      } catch (er) {
        return null;
      }
    };
    module2.exports = validRange;
  }
});

// node_modules/semver/ranges/outside.js
var require_outside = __commonJS({
  "node_modules/semver/ranges/outside.js"(exports2, module2) {
    "use strict";
    var SemVer = require_semver();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var Range = require_range();
    var satisfies = require_satisfies();
    var gt = require_gt();
    var lt = require_lt();
    var lte2 = require_lte();
    var gte2 = require_gte();
    var outside = (version, range2, hilo, options) => {
      version = new SemVer(version, options);
      range2 = new Range(range2, options);
      let gtfn, ltefn, ltfn, comp, ecomp;
      switch (hilo) {
        case ">":
          gtfn = gt;
          ltefn = lte2;
          ltfn = lt;
          comp = ">";
          ecomp = ">=";
          break;
        case "<":
          gtfn = lt;
          ltefn = gte2;
          ltfn = gt;
          comp = "<";
          ecomp = "<=";
          break;
        default:
          throw new TypeError('Must provide a hilo val of "<" or ">"');
      }
      if (satisfies(version, range2, options)) {
        return false;
      }
      for (let i = 0; i < range2.set.length; ++i) {
        const comparators = range2.set[i];
        let high = null;
        let low = null;
        comparators.forEach((comparator) => {
          if (comparator.semver === ANY) {
            comparator = new Comparator(">=0.0.0");
          }
          high = high || comparator;
          low = low || comparator;
          if (gtfn(comparator.semver, high.semver, options)) {
            high = comparator;
          } else if (ltfn(comparator.semver, low.semver, options)) {
            low = comparator;
          }
        });
        if (high.operator === comp || high.operator === ecomp) {
          return false;
        }
        if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) {
          return false;
        } else if (low.operator === ecomp && ltfn(version, low.semver)) {
          return false;
        }
      }
      return true;
    };
    module2.exports = outside;
  }
});

// node_modules/semver/ranges/gtr.js
var require_gtr = __commonJS({
  "node_modules/semver/ranges/gtr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var gtr = (version, range2, options) => outside(version, range2, ">", options);
    module2.exports = gtr;
  }
});

// node_modules/semver/ranges/ltr.js
var require_ltr = __commonJS({
  "node_modules/semver/ranges/ltr.js"(exports2, module2) {
    "use strict";
    var outside = require_outside();
    var ltr = (version, range2, options) => outside(version, range2, "<", options);
    module2.exports = ltr;
  }
});

// node_modules/semver/ranges/intersects.js
var require_intersects = __commonJS({
  "node_modules/semver/ranges/intersects.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var intersects = (r1, r2, options) => {
      r1 = new Range(r1, options);
      r2 = new Range(r2, options);
      return r1.intersects(r2, options);
    };
    module2.exports = intersects;
  }
});

// node_modules/semver/ranges/simplify.js
var require_simplify = __commonJS({
  "node_modules/semver/ranges/simplify.js"(exports2, module2) {
    "use strict";
    var satisfies = require_satisfies();
    var compare = require_compare();
    module2.exports = (versions, range2, options) => {
      const set = [];
      let first = null;
      let prev = null;
      const v = versions.sort((a, b) => compare(a, b, options));
      for (const version of v) {
        const included = satisfies(version, range2, options);
        if (included) {
          prev = version;
          if (!first) {
            first = version;
          }
        } else {
          if (prev) {
            set.push([first, prev]);
          }
          prev = null;
          first = null;
        }
      }
      if (first) {
        set.push([first, null]);
      }
      const ranges = [];
      for (const [min, max] of set) {
        if (min === max) {
          ranges.push(min);
        } else if (!max && min === v[0]) {
          ranges.push("*");
        } else if (!max) {
          ranges.push(`>=${min}`);
        } else if (min === v[0]) {
          ranges.push(`<=${max}`);
        } else {
          ranges.push(`${min} - ${max}`);
        }
      }
      const simplified = ranges.join(" || ");
      const original = typeof range2.raw === "string" ? range2.raw : String(range2);
      return simplified.length < original.length ? simplified : range2;
    };
  }
});

// node_modules/semver/ranges/subset.js
var require_subset = __commonJS({
  "node_modules/semver/ranges/subset.js"(exports2, module2) {
    "use strict";
    var Range = require_range();
    var Comparator = require_comparator();
    var { ANY } = Comparator;
    var satisfies = require_satisfies();
    var compare = require_compare();
    var subset = (sub, dom, options = {}) => {
      if (sub === dom) {
        return true;
      }
      sub = new Range(sub, options);
      dom = new Range(dom, options);
      let sawNonNull = false;
      OUTER: for (const simpleSub of sub.set) {
        for (const simpleDom of dom.set) {
          const isSub = simpleSubset(simpleSub, simpleDom, options);
          sawNonNull = sawNonNull || isSub !== null;
          if (isSub) {
            continue OUTER;
          }
        }
        if (sawNonNull) {
          return false;
        }
      }
      return true;
    };
    var minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
    var minimumVersion = [new Comparator(">=0.0.0")];
    var simpleSubset = (sub, dom, options) => {
      if (sub === dom) {
        return true;
      }
      if (sub.length === 1 && sub[0].semver === ANY) {
        if (dom.length === 1 && dom[0].semver === ANY) {
          return true;
        } else if (options.includePrerelease) {
          sub = minimumVersionWithPreRelease;
        } else {
          sub = minimumVersion;
        }
      }
      if (dom.length === 1 && dom[0].semver === ANY) {
        if (options.includePrerelease) {
          return true;
        } else {
          dom = minimumVersion;
        }
      }
      const eqSet = /* @__PURE__ */ new Set();
      let gt, lt;
      for (const c of sub) {
        if (c.operator === ">" || c.operator === ">=") {
          gt = higherGT(gt, c, options);
        } else if (c.operator === "<" || c.operator === "<=") {
          lt = lowerLT(lt, c, options);
        } else {
          eqSet.add(c.semver);
        }
      }
      if (eqSet.size > 1) {
        return null;
      }
      let gtltComp;
      if (gt && lt) {
        gtltComp = compare(gt.semver, lt.semver, options);
        if (gtltComp > 0) {
          return null;
        } else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) {
          return null;
        }
      }
      for (const eq of eqSet) {
        if (gt && !satisfies(eq, String(gt), options)) {
          return null;
        }
        if (lt && !satisfies(eq, String(lt), options)) {
          return null;
        }
        for (const c of dom) {
          if (!satisfies(eq, String(c), options)) {
            return false;
          }
        }
        return true;
      }
      let higher, lower;
      let hasDomLT, hasDomGT;
      let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
      let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
      if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) {
        needDomLTPre = false;
      }
      for (const c of dom) {
        hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
        hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
        if (gt) {
          if (needDomGTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) {
              needDomGTPre = false;
            }
          }
          if (c.operator === ">" || c.operator === ">=") {
            higher = higherGT(gt, c, options);
            if (higher === c && higher !== gt) {
              return false;
            }
          } else if (gt.operator === ">=" && !c.test(gt.semver)) {
            return false;
          }
        }
        if (lt) {
          if (needDomLTPre) {
            if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) {
              needDomLTPre = false;
            }
          }
          if (c.operator === "<" || c.operator === "<=") {
            lower = lowerLT(lt, c, options);
            if (lower === c && lower !== lt) {
              return false;
            }
          } else if (lt.operator === "<=" && !c.test(lt.semver)) {
            return false;
          }
        }
        if (!c.operator && (lt || gt) && gtltComp !== 0) {
          return false;
        }
      }
      if (gt && hasDomLT && !lt && gtltComp !== 0) {
        return false;
      }
      if (lt && hasDomGT && !gt && gtltComp !== 0) {
        return false;
      }
      if (needDomGTPre || needDomLTPre) {
        return false;
      }
      return true;
    };
    var higherGT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
    };
    var lowerLT = (a, b, options) => {
      if (!a) {
        return b;
      }
      const comp = compare(a.semver, b.semver, options);
      return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
    };
    module2.exports = subset;
  }
});

// node_modules/semver/index.js
var require_semver2 = __commonJS({
  "node_modules/semver/index.js"(exports2, module2) {
    "use strict";
    var internalRe = require_re();
    var constants = require_constants();
    var SemVer = require_semver();
    var identifiers = require_identifiers();
    var parse = require_parse();
    var valid = require_valid();
    var clean = require_clean();
    var inc = require_inc();
    var diff = require_diff();
    var major = require_major();
    var minor = require_minor();
    var patch = require_patch();
    var prerelease = require_prerelease();
    var compare = require_compare();
    var rcompare = require_rcompare();
    var compareLoose = require_compare_loose();
    var compareBuild = require_compare_build();
    var sort = require_sort();
    var rsort = require_rsort();
    var gt = require_gt();
    var lt = require_lt();
    var eq = require_eq();
    var neq = require_neq();
    var gte2 = require_gte();
    var lte2 = require_lte();
    var cmp = require_cmp();
    var coerce = require_coerce();
    var truncate = require_truncate();
    var Comparator = require_comparator();
    var Range = require_range();
    var satisfies = require_satisfies();
    var toComparators = require_to_comparators();
    var maxSatisfying = require_max_satisfying();
    var minSatisfying = require_min_satisfying();
    var minVersion = require_min_version();
    var validRange = require_valid2();
    var outside = require_outside();
    var gtr = require_gtr();
    var ltr = require_ltr();
    var intersects = require_intersects();
    var simplifyRange = require_simplify();
    var subset = require_subset();
    module2.exports = {
      parse,
      valid,
      clean,
      inc,
      diff,
      major,
      minor,
      patch,
      prerelease,
      compare,
      rcompare,
      compareLoose,
      compareBuild,
      sort,
      rsort,
      gt,
      lt,
      eq,
      neq,
      gte: gte2,
      lte: lte2,
      cmp,
      coerce,
      truncate,
      Comparator,
      Range,
      satisfies,
      toComparators,
      maxSatisfying,
      minSatisfying,
      minVersion,
      validRange,
      outside,
      gtr,
      ltr,
      intersects,
      simplifyRange,
      subset,
      SemVer,
      re: internalRe.re,
      src: internalRe.src,
      tokens: internalRe.t,
      SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
      RELEASE_TYPES: constants.RELEASE_TYPES,
      compareIdentifiers: identifiers.compareIdentifiers,
      rcompareIdentifiers: identifiers.rcompareIdentifiers
    };
  }
});

// src/action.ts
var import_promises5 = require("node:fs/promises");
var import_node_path5 = require("node:path");

// src/config.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");

// src/constants.ts
var TOOL_NAME = "RepoLens";
var TOOL_VERSION = "0.2.0";
var DEFAULT_STALE_DAYS = 180;
var DEFAULT_LARGE_FILE_BYTES = 1024 * 1024;
var DEFAULT_CONFIG_FILE = ".repolens.json";
var DEFAULT_EXCLUDES = [
  "**/.repolens/**",
  "**/fixtures/**",
  "**/__fixtures__/**",
  "**/testdata/**"
];
var IGNORED_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  "target"
]);
var LOCKFILE_NAMES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "Gemfile.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "composer.lock"
]);

// src/config.ts
var FAIL_ON_VALUES = /* @__PURE__ */ new Set([
  "none",
  "critical",
  "warning",
  "new-critical",
  "new-warning"
]);
var DEFAULT_POLICY = {
  failOn: "critical",
  strict: false
};
var DEFAULT_CONFIG = {
  schema: 1,
  excludes: [...DEFAULT_EXCLUDES],
  staleDays: DEFAULT_STALE_DAYS,
  largeFileMB: DEFAULT_LARGE_FILE_BYTES / (1024 * 1024),
  policy: { ...DEFAULT_POLICY }
};
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertKnownKeys(value, allowed, context) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `${context} contains unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`
    );
  }
}
function positiveNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number.`);
  }
  return value;
}
function parseFailOn(value, field = "failOn") {
  if (!FAIL_ON_VALUES.has(value)) {
    throw new Error(
      `${field} must be one of: ${[...FAIL_ON_VALUES].join(", ")}.`
    );
  }
  return value;
}
function parseConfig(value) {
  if (!isObject(value)) {
    throw new Error("RepoLens config must be a JSON object.");
  }
  assertKnownKeys(
    value,
    /* @__PURE__ */ new Set(["schema", "excludes", "staleDays", "largeFileMB", "policy"]),
    "RepoLens config"
  );
  if (value.schema !== 1) {
    throw new Error("RepoLens config schema must be 1.");
  }
  let excludes = [...DEFAULT_CONFIG.excludes];
  if (value.excludes !== void 0) {
    if (!Array.isArray(value.excludes) || !value.excludes.every(
      (item) => typeof item === "string" && item.length > 0 && item.length <= 300 && !item.includes("\0")
    )) {
      throw new Error("excludes must be an array of non-empty path globs.");
    }
    excludes = [...new Set(value.excludes)];
  }
  let policy = { ...DEFAULT_POLICY };
  if (value.policy !== void 0) {
    if (!isObject(value.policy)) {
      throw new Error("policy must be a JSON object.");
    }
    assertKnownKeys(
      value.policy,
      /* @__PURE__ */ new Set(["failOn", "strict"]),
      "policy"
    );
    if (value.policy.failOn !== void 0) {
      if (typeof value.policy.failOn !== "string") {
        throw new Error("policy.failOn must be a string.");
      }
      policy.failOn = parseFailOn(value.policy.failOn, "policy.failOn");
    }
    if (value.policy.strict !== void 0) {
      if (typeof value.policy.strict !== "boolean") {
        throw new Error("policy.strict must be a boolean.");
      }
      policy.strict = value.policy.strict;
    }
  }
  return {
    schema: 1,
    excludes,
    staleDays: value.staleDays === void 0 ? DEFAULT_CONFIG.staleDays : Math.floor(positiveNumber(value.staleDays, "staleDays")),
    largeFileMB: value.largeFileMB === void 0 ? DEFAULT_CONFIG.largeFileMB : positiveNumber(value.largeFileMB, "largeFileMB"),
    policy
  };
}
async function isDirectory(path2) {
  try {
    return (await (0, import_promises.stat)(path2)).isDirectory();
  } catch {
    return false;
  }
}
async function isFile(path2) {
  try {
    return (await (0, import_promises.stat)(path2)).isFile();
  } catch {
    return false;
  }
}
async function resolveConfigPath(target, requested) {
  if (requested) {
    return {
      path: (0, import_node_path.resolve)(requested),
      required: true
    };
  }
  if (await isDirectory((0, import_node_path.resolve)(target))) {
    return {
      path: (0, import_node_path.join)((0, import_node_path.resolve)(target), DEFAULT_CONFIG_FILE),
      required: false
    };
  }
  return {
    path: (0, import_node_path.resolve)(DEFAULT_CONFIG_FILE),
    required: false
  };
}
async function loadConfig(path2, required) {
  if (!await isFile(path2)) {
    if (required) throw new Error(`Config file was not found: ${path2}`);
    return {
      config: {
        ...DEFAULT_CONFIG,
        excludes: [...DEFAULT_CONFIG.excludes],
        policy: { ...DEFAULT_CONFIG.policy }
      },
      source: null
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(await (0, import_promises.readFile)(path2, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse RepoLens config ${path2}: ${detail}`);
  }
  return { config: parseConfig(parsed), source: path2 };
}

// src/reporters.ts
var severityLabel = {
  pass: "PASS",
  info: "INFO",
  warning: "WARN",
  critical: "CRITICAL",
  unknown: "UNKNOWN"
};
function renderJson(report) {
  return `${JSON.stringify(report, null, 2)}
`;
}
function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}
function renderGitHubMarkdown(report) {
  const status = report.policy.operationalError ? "INCOMPLETE" : report.policy.passed ? "POLICY PASSED" : "ACTION REQUIRED";
  const lines = [
    `## RepoLens \xB7 ${status}`,
    "",
    `**${escapeMarkdown(report.repository.name)}** \xB7 policy \`${report.policy.failOn}${report.policy.strict ? " \xB7 strict" : ""}\``,
    ""
  ];
  if (report.comparison.baseline) {
    lines.push(
      `New since baseline: **${report.comparison.new.critical} critical**, **${report.comparison.new.warning} warning**, **${report.comparison.new.unknown} unknown**.`,
      "",
      `Baseline: ${escapeMarkdown(report.comparison.baseline.generatedAt)} \xB7 \`${escapeMarkdown(report.comparison.baseline.source)}\``,
      ""
    );
  } else {
    lines.push(
      `Current: **${report.counts.critical} critical**, **${report.counts.warning} warning**, **${report.counts.unknown} unknown**.`,
      ""
    );
  }
  lines.push(
    `Detection scope: ${report.coverage.includedFiles}/${report.coverage.trackedFiles} files included, ${report.coverage.excludedFiles} excluded; npm metadata ${report.coverage.dependencyPackages.checked}/${report.coverage.dependencyPackages.eligible}; GitHub metadata ${report.coverage.github.status}.`,
    "",
    "### Current actionable findings",
    "",
    "| Severity | Check | Result |",
    "| --- | --- | --- |"
  );
  const actionable = report.findings.filter(
    (item) => item.severity === "critical" || item.severity === "warning" || item.severity === "unknown"
  );
  if (actionable.length === 0) {
    lines.push("| PASS | Maintenance queue | No actionable findings |");
  } else {
    for (const finding2 of actionable) {
      lines.push(
        `| ${severityLabel[finding2.severity]} | ${escapeMarkdown(finding2.title)} | ${escapeMarkdown(finding2.summary)} |`
      );
    }
  }
  lines.push(
    "",
    `<sub>Score ${report.score}/100 \xB7 Grade ${report.grade} is a secondary heuristic. Generated ${escapeMarkdown(report.generatedAt)}.</sub>`,
    ""
  );
  return lines.join("\n");
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function evidenceValue(value) {
  return value === null ? "Unavailable" : String(value);
}
function renderEvidence(finding2) {
  if (finding2.evidence.length === 0) return "";
  return `<dl class="evidence">${finding2.evidence.map(
    (item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(evidenceValue(item.value))}</dd></div>`
  ).join("")}</dl>`;
}
function renderFinding(finding2) {
  const deduction = finding2.deduction > 0 ? `<span class="deduction">\u2212${finding2.deduction}</span>` : "";
  const action = finding2.action ? `<p class="action"><strong>Action</strong> ${escapeHtml(finding2.action)}</p>` : "";
  return `<article class="finding finding-${finding2.severity}">
    <header>
      <span class="severity">${severityLabel[finding2.severity]}</span>
      <h3>${escapeHtml(finding2.title)}</h3>
      ${deduction}
    </header>
    <p>${escapeHtml(finding2.summary)}</p>
    ${renderEvidence(finding2)}
    ${action}
  </article>`;
}
function renderHtml(report) {
  const repositoryUrl = report.repository.github?.url;
  const repositoryName = escapeHtml(report.repository.name);
  const target = repositoryUrl ? `<a href="${escapeHtml(repositoryUrl)}">${escapeHtml(repositoryUrl)}</a>` : `<code>${escapeHtml(report.repository.input)}</code>`;
  const actionMarkup = report.actions.length === 0 ? "<p>No improvement actions were generated.</p>" : `<ol>${report.actions.map(
    (item) => `<li><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.reason)}</span></li>`
  ).join("")}</ol>`;
  const status = report.policy.operationalError ? "Incomplete" : report.policy.passed ? "Policy passed" : "Action required";
  const headlineCounts = report.comparison.baseline ? report.comparison.new : {
    critical: report.counts.critical,
    warning: report.counts.warning,
    unknown: report.counts.unknown
  };
  const comparisonMarkup = report.comparison.baseline ? `<section aria-labelledby="changes-title">
      <h2 id="changes-title">Changes since baseline</h2>
      <p class="baseline">Compared with ${escapeHtml(report.comparison.baseline.generatedAt)} \xB7 <code>${escapeHtml(report.comparison.baseline.source)}</code></p>
      ${report.comparison.changes.length === 0 ? "<p>No actionable finding changed.</p>" : `<ol class="changes">${report.comparison.changes.map(
    (change) => `<li><strong>${escapeHtml(change.kind)}</strong><span>${escapeHtml(change.title)}${change.detail ? `<small>${escapeHtml(change.detail)}</small>` : ""}</span><code>${escapeHtml(change.from ?? "absent")} \u2192 ${escapeHtml(change.to ?? "absent")}</code></li>`
  ).join("")}</ol>`}
    </section>` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>RepoLens report \u2014 ${repositoryName}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f3ea;
      --surface: #fffdf8;
      --ink: #181a18;
      --muted: #656a63;
      --rule: #cfd2ca;
      --pass: #166534;
      --info: #075985;
      --warn: #92400e;
      --critical: #b91c1c;
      --accent: #3154ff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); line-height: 1.55; }
    a { color: var(--accent); overflow-wrap: anywhere; }
    code { overflow-wrap: anywhere; }
    main { width: min(100% - 2rem, 76rem); margin: 0 auto; padding: 3rem 0 6rem; }
    .hero { display: grid; grid-template-columns: 1fr auto; gap: 2rem; align-items: end; padding: 2rem 0 3rem; border-bottom: 2px solid var(--ink); }
    .eyebrow, .severity { font: 700 .72rem/1.2 ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: .07em; text-transform: uppercase; }
    h1 { margin: .4rem 0; font-size: clamp(2.8rem, 8vw, 7rem); line-height: .9; letter-spacing: -.055em; }
    .target { margin: 0; color: var(--muted); }
    .status-card { min-width: 15rem; padding: 1.25rem; border: 2px solid currentColor; color: var(--accent); }
    .status-card strong, .status-card span { display: block; }
    .status-card strong { margin-top: .4rem; font-size: 1.65rem; line-height: 1; }
    .status-card span { margin-top: .7rem; color: var(--muted); font-size: .78rem; }
    .counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; margin: 0 0 4rem; background: var(--rule); border-bottom: 1px solid var(--rule); }
    .counts div { padding: 1.1rem; background: var(--surface); }
    .counts strong { display: block; font-size: 1.6rem; }
    section { margin-top: 4rem; }
    h2 { margin: 0 0 1.5rem; font-size: clamp(1.8rem, 4vw, 3.4rem); letter-spacing: -.04em; }
    .findings { display: grid; gap: .8rem; }
    .finding { padding: 1.25rem; border: 1px solid var(--rule); border-left: .45rem solid var(--info); background: var(--surface); }
    .finding-pass { border-left-color: var(--pass); }
    .finding-warning { border-left-color: var(--warn); }
    .finding-critical { border-left-color: var(--critical); }
    .finding-unknown { border-left-color: #7e22ce; }
    .finding header { display: grid; grid-template-columns: auto 1fr auto; gap: 1rem; align-items: center; }
    .finding h3 { margin: 0; font-size: 1.05rem; }
    .finding > p { margin: .8rem 0 0; }
    .deduction { font-weight: 800; color: var(--critical); }
    .severity { color: var(--info); }
    .finding-pass .severity { color: var(--pass); }
    .finding-warning .severity { color: var(--warn); }
    .finding-critical .severity { color: var(--critical); }
    .finding-unknown .severity { color: #7e22ce; }
    .evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .45rem 1rem; margin: 1rem 0 0; }
    .evidence div { min-width: 0; padding-top: .45rem; border-top: 1px solid var(--rule); }
    dt { color: var(--muted); font: 700 .68rem/1.4 ui-monospace, SFMono-Regular, Consolas, monospace; }
    dd { margin: .2rem 0 0; overflow-wrap: anywhere; }
    .action { padding: .8rem; background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .action strong { margin-right: .5rem; color: var(--accent); }
    .plan ol { display: grid; gap: .75rem; padding-left: 1.5rem; }
    .plan li { padding: 1rem; border-bottom: 1px solid var(--rule); }
    .plan li strong, .plan li span { display: block; }
    .plan li span { margin-top: .35rem; color: var(--muted); }
    .limitations { color: var(--muted); }
    .scope, .baseline { color: var(--muted); }
    .scope code { color: var(--ink); }
    .changes { display: grid; gap: .5rem; padding: 0; list-style: none; }
    .changes li { display: grid; grid-template-columns: 7rem 1fr auto; gap: 1rem; padding: .8rem 0; border-bottom: 1px solid var(--rule); }
    .changes strong { text-transform: uppercase; }
    footer { margin-top: 5rem; padding-top: 1rem; border-top: 2px solid var(--ink); color: var(--muted); font-size: .78rem; }
    @media (max-width: 42rem) {
      main { width: min(100% - 1.25rem, 76rem); padding-top: 1rem; }
      .hero { grid-template-columns: 1fr; }
      .status-card { width: 100%; justify-self: start; }
      .counts { grid-template-columns: repeat(2, 1fr); }
      .finding header { grid-template-columns: 1fr auto; }
      .severity { grid-column: 1 / -1; }
      .evidence { grid-template-columns: 1fr; }
      .changes li { grid-template-columns: 1fr; gap: .25rem; }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121512;
        --surface: #1c201c;
        --ink: #f3f2e9;
        --muted: #a9afa7;
        --rule: #3b423b;
        --pass: #86efac;
        --info: #7dd3fc;
        --warn: #fcd34d;
        --critical: #fca5a5;
        --accent: #9eafff;
      }
    }
    @media print {
      :root { color-scheme: light; }
      body { background: #fff; }
      main { width: 100%; padding: 0; }
      .finding { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main>
    <header class="hero">
      <div>
        <p class="eyebrow">RepoLens ${escapeHtml(report.tool.version)} \xB7 repository maintenance audit</p>
        <h1>${repositoryName}</h1>
        <p class="target">${target}</p>
      </div>
      <div class="status-card">
        <p class="eyebrow">Policy \xB7 ${escapeHtml(report.policy.failOn)}${report.policy.strict ? " \xB7 strict" : ""}</p>
        <strong>${status}</strong>
        <span>Score ${report.score}/100 \xB7 Grade ${report.grade} \xB7 secondary heuristic</span>
      </div>
    </header>

    <div class="counts" aria-label="${report.comparison.baseline ? "New finding" : "Current finding"} counts">
      <div><strong>${headlineCounts.critical}</strong>${report.comparison.baseline ? "New critical" : "Critical"}</div>
      <div><strong>${headlineCounts.warning}</strong>${report.comparison.baseline ? "New warning" : "Warning"}</div>
      <div><strong>${headlineCounts.unknown}</strong>${report.comparison.baseline ? "New unknown" : "Unknown"}</div>
      <div><strong>${report.counts.pass}</strong>Pass</div>
      <div><strong>${report.counts.info}</strong>Info</div>
    </div>

    <section class="scope" aria-labelledby="scope-title">
      <h2 id="scope-title">Detection scope</h2>
      <p><strong>${report.coverage.includedFiles}</strong> of ${report.coverage.trackedFiles} discovered files included; ${report.coverage.excludedFiles} excluded.</p>
      <p>npm metadata ${report.coverage.dependencyPackages.checked}/${report.coverage.dependencyPackages.eligible} (${escapeHtml(report.coverage.dependencyPackages.status)}) \xB7 GitHub metadata ${escapeHtml(report.coverage.github.status)}</p>
      ${report.coverage.excludes.length > 0 ? `<p>Exclude globs: <code>${escapeHtml(report.coverage.excludes.join(", "))}</code></p>` : ""}
    </section>

    ${comparisonMarkup}

    <section aria-labelledby="checks-title">
      <h2 id="checks-title">Repository checks</h2>
      <div class="findings">${report.findings.map(renderFinding).join("")}</div>
    </section>

    <section class="plan" aria-labelledby="plan-title">
      <h2 id="plan-title">Improvement plan</h2>
      ${actionMarkup}
    </section>

    <section class="limitations" aria-labelledby="limits-title">
      <h2 id="limits-title">What this report does not prove</h2>
      <ul>${report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>

    <footer>
      Generated ${escapeHtml(report.generatedAt)} by RepoLens ${escapeHtml(report.tool.version)}.
      This static report contains no scripts, remote fonts, analytics, or stored token.
    </footer>
  </main>
</body>
</html>
`.replace(/[ \t]+$/gm, "");
}

// src/runner.ts
var import_promises4 = require("node:fs/promises");
var import_node_path4 = require("node:path");

// node_modules/balanced-match/dist/esm/index.js
var balanced = (a, b, str) => {
  const ma = a instanceof RegExp ? maybeMatch(a, str) : a;
  const mb = b instanceof RegExp ? maybeMatch(b, str) : b;
  const r = ma !== null && mb != null && range(ma, mb, str);
  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + ma.length, r[1]),
    post: str.slice(r[1] + mb.length)
  };
};
var maybeMatch = (reg, str) => {
  const m = str.match(reg);
  return m ? m[0] : null;
};
var range = (a, b, str) => {
  let begs, beg, left, right = void 0, result;
  let ai = str.indexOf(a);
  let bi = str.indexOf(b, ai + 1);
  let i = ai;
  if (ai >= 0 && bi > 0) {
    if (a === b) {
      return [ai, bi];
    }
    begs = [];
    left = str.length;
    while (i >= 0 && !result) {
      if (i === ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length === 1) {
        const r = begs.pop();
        if (r !== void 0)
          result = [r, bi];
      } else {
        beg = begs.pop();
        if (beg !== void 0 && beg < left) {
          left = beg;
          right = bi;
        }
        bi = str.indexOf(b, i + 1);
      }
      i = ai < bi && ai >= 0 ? ai : bi;
    }
    if (begs.length && right !== void 0) {
      result = [left, right];
    }
  }
  return result;
};

// node_modules/brace-expansion/dist/esm/index.js
var escSlash = "\0SLASH" + Math.random() + "\0";
var escOpen = "\0OPEN" + Math.random() + "\0";
var escClose = "\0CLOSE" + Math.random() + "\0";
var escComma = "\0COMMA" + Math.random() + "\0";
var escPeriod = "\0PERIOD" + Math.random() + "\0";
var escSlashPattern = new RegExp(escSlash, "g");
var escOpenPattern = new RegExp(escOpen, "g");
var escClosePattern = new RegExp(escClose, "g");
var escCommaPattern = new RegExp(escComma, "g");
var escPeriodPattern = new RegExp(escPeriod, "g");
var slashPattern = /\\\\/g;
var openPattern = /\\{/g;
var closePattern = /\\}/g;
var commaPattern = /\\,/g;
var periodPattern = /\\\./g;
var EXPANSION_MAX = 1e5;
var EXPANSION_MAX_LENGTH = 4e6;
function numeric(str) {
  return !isNaN(str) ? parseInt(str, 10) : str.charCodeAt(0);
}
function escapeBraces(str) {
  return str.replace(slashPattern, escSlash).replace(openPattern, escOpen).replace(closePattern, escClose).replace(commaPattern, escComma).replace(periodPattern, escPeriod);
}
function unescapeBraces(str) {
  return str.replace(escSlashPattern, "\\").replace(escOpenPattern, "{").replace(escClosePattern, "}").replace(escCommaPattern, ",").replace(escPeriodPattern, ".");
}
function parseCommaParts(str) {
  if (!str) {
    return [""];
  }
  const parts = [];
  const m = balanced("{", "}", str);
  if (!m) {
    return str.split(",");
  }
  const { pre, body, post } = m;
  const p = pre.split(",");
  p[p.length - 1] += "{" + body + "}";
  const postParts = parseCommaParts(post);
  if (post.length) {
    ;
    p[p.length - 1] += postParts.shift();
    p.push.apply(p, postParts);
  }
  parts.push.apply(parts, p);
  return parts;
}
function expand(str, options = {}) {
  if (!str) {
    return [];
  }
  const { max = EXPANSION_MAX, maxLength = EXPANSION_MAX_LENGTH } = options;
  if (str.slice(0, 2) === "{}") {
    str = "\\{\\}" + str.slice(2);
  }
  return expand_(escapeBraces(str), max, maxLength, true).map(unescapeBraces);
}
function embrace(str) {
  return "{" + str + "}";
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}
function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}
function combine(acc, pre, values, max, maxLength, dropEmpties) {
  const out = [];
  let length = 0;
  for (let a = 0; a < acc.length; a++) {
    for (let v = 0; v < values.length; v++) {
      if (out.length >= max)
        return out;
      const expansion = acc[a] + pre + values[v];
      if (dropEmpties && !expansion)
        continue;
      if (length + expansion.length > maxLength)
        return out;
      out.push(expansion);
      length += expansion.length;
    }
  }
  return out;
}
function expandSequence(body, isAlphaSequence, max) {
  const n = body.split(/\.\./);
  const N = [];
  if (n[0] === void 0 || n[1] === void 0) {
    return N;
  }
  const x = numeric(n[0]);
  const y = numeric(n[1]);
  const width = Math.max(n[0].length, n[1].length);
  let incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
  let test = lte;
  const reverse = y < x;
  if (reverse) {
    incr *= -1;
    test = gte;
  }
  const pad = n.some(isPadded);
  for (let i = x; test(i, y) && N.length < max; i += incr) {
    let c;
    if (isAlphaSequence) {
      c = String.fromCharCode(i);
      if (c === "\\") {
        c = "";
      }
    } else {
      c = String(i);
      if (pad) {
        const need = width - c.length;
        if (need > 0) {
          const z = new Array(need + 1).join("0");
          if (i < 0) {
            c = "-" + z + c.slice(1);
          } else {
            c = z + c;
          }
        }
      }
    }
    N.push(c);
  }
  return N;
}
function expand_(str, max, maxLength, isTop) {
  let acc = [""];
  let dropEmpties = false;
  let firstGroup = true;
  for (; ; ) {
    const m = balanced("{", "}", str);
    if (!m) {
      return combine(acc, str, [""], max, maxLength, dropEmpties);
    }
    const pre = m.pre;
    if (/\$$/.test(pre)) {
      acc = combine(acc, pre + "{" + m.body + "}", [""], max, maxLength, dropEmpties && !m.post.length);
      firstGroup = false;
      if (!m.post.length)
        break;
      str = m.post;
      continue;
    }
    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    const isSequence = isNumericSequence || isAlphaSequence;
    const isOptions = m.body.indexOf(",") >= 0;
    if (!isSequence && !isOptions) {
      if (m.post.match(/,(?!,).*\}/)) {
        str = m.pre + "{" + m.body + escClose + m.post;
        isTop = true;
        continue;
      }
      return combine(acc, pre + "{" + m.body + "}" + m.post, [""], max, maxLength, dropEmpties);
    }
    if (firstGroup) {
      dropEmpties = isTop && !isSequence;
      firstGroup = false;
    }
    let values;
    if (isSequence) {
      values = expandSequence(m.body, isAlphaSequence, max);
    } else {
      let n = parseCommaParts(m.body);
      if (n.length === 1 && n[0] !== void 0) {
        n = expand_(n[0], max, maxLength, false).map(embrace);
        if (n.length === 1) {
          acc = combine(acc, pre + n[0], [""], max, maxLength, dropEmpties && !m.post.length);
          if (!m.post.length)
            break;
          str = m.post;
          continue;
        }
      }
      values = [];
      for (let j = 0; j < n.length; j++) {
        values.push.apply(values, expand_(n[j], max, maxLength, false));
      }
    }
    acc = combine(acc, pre, values, max, maxLength, dropEmpties && !m.post.length);
    if (!m.post.length)
      break;
    str = m.post;
  }
  return acc;
}

// node_modules/minimatch/dist/esm/assert-valid-pattern.js
var MAX_PATTERN_LENGTH = 1024 * 64;
var assertValidPattern = (pattern) => {
  if (typeof pattern !== "string") {
    throw new TypeError("invalid pattern");
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new TypeError("pattern is too long");
  }
};

// node_modules/minimatch/dist/esm/brace-expressions.js
var posixClasses = {
  "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true],
  "[:alpha:]": ["\\p{L}\\p{Nl}", true],
  "[:ascii:]": ["\\x00-\\x7f", false],
  "[:blank:]": ["\\p{Zs}\\t", true],
  "[:cntrl:]": ["\\p{Cc}", true],
  "[:digit:]": ["\\p{Nd}", true],
  "[:graph:]": ["\\p{Z}\\p{C}", true, true],
  "[:lower:]": ["\\p{Ll}", true],
  "[:print:]": ["\\p{C}", true],
  "[:punct:]": ["\\p{P}", true],
  "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true],
  "[:upper:]": ["\\p{Lu}", true],
  "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true],
  "[:xdigit:]": ["A-Fa-f0-9", false]
};
var braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&");
var regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var rangesToString = (ranges) => ranges.join("");
var parseClass = (glob, position) => {
  const pos = position;
  if (glob.charAt(pos) !== "[") {
    throw new Error("not in a brace expression");
  }
  const ranges = [];
  const negs = [];
  let i = pos + 1;
  let sawStart = false;
  let uflag = false;
  let escaping = false;
  let negate = false;
  let endPos = pos;
  let rangeStart = "";
  WHILE: while (i < glob.length) {
    const c = glob.charAt(i);
    if ((c === "!" || c === "^") && i === pos + 1) {
      negate = true;
      i++;
      continue;
    }
    if (c === "]" && sawStart && !escaping) {
      endPos = i + 1;
      break;
    }
    sawStart = true;
    if (c === "\\") {
      if (!escaping) {
        escaping = true;
        i++;
        continue;
      }
    }
    if (c === "[" && !escaping) {
      for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) {
        if (glob.startsWith(cls, i)) {
          if (rangeStart) {
            return ["$.", false, glob.length - pos, true];
          }
          i += cls.length;
          if (neg)
            negs.push(unip);
          else
            ranges.push(unip);
          uflag = uflag || u;
          continue WHILE;
        }
      }
    }
    escaping = false;
    if (rangeStart) {
      if (c > rangeStart) {
        ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c));
      } else if (c === rangeStart) {
        ranges.push(braceEscape(c));
      }
      rangeStart = "";
      i++;
      continue;
    }
    if (glob.startsWith("-]", i + 1)) {
      ranges.push(braceEscape(c + "-"));
      i += 2;
      continue;
    }
    if (glob.startsWith("-", i + 1)) {
      rangeStart = c;
      i += 2;
      continue;
    }
    ranges.push(braceEscape(c));
    i++;
  }
  if (endPos < i) {
    return ["", false, 0, false];
  }
  if (!ranges.length && !negs.length) {
    return ["$.", false, glob.length - pos, true];
  }
  if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) {
    const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
    return [regexpEscape(r), false, endPos - pos, false];
  }
  const sranges = "[" + (negate ? "^" : "") + rangesToString(ranges) + "]";
  const snegs = "[" + (negate ? "" : "^") + rangesToString(negs) + "]";
  const comb = ranges.length && negs.length ? "(" + sranges + "|" + snegs + ")" : ranges.length ? sranges : snegs;
  return [comb, uflag, endPos - pos, true];
};

// node_modules/minimatch/dist/esm/unescape.js
var unescape = (s, { windowsPathsNoEscape = false, magicalBraces = true } = {}) => {
  if (magicalBraces) {
    return windowsPathsNoEscape ? s.replace(/\[([^/\\])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\])\]/g, "$1$2").replace(/\\([^/])/g, "$1");
  }
  return windowsPathsNoEscape ? s.replace(/\[([^/\\{}])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\{}])\]/g, "$1$2").replace(/\\([^/{}])/g, "$1");
};

// node_modules/minimatch/dist/esm/ast.js
var _a;
var types = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]);
var isExtglobType = (c) => types.has(c);
var isExtglobAST = (c) => isExtglobType(c.type);
var adoptionMap = /* @__PURE__ */ new Map([
  ["!", ["@"]],
  ["?", ["?", "@"]],
  ["@", ["@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@"]]
]);
var adoptionWithSpaceMap = /* @__PURE__ */ new Map([
  ["!", ["?"]],
  ["@", ["?"]],
  ["+", ["?", "*"]]
]);
var adoptionAnyMap = /* @__PURE__ */ new Map([
  ["!", ["?", "@"]],
  ["?", ["?", "@"]],
  ["@", ["?", "@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@", "?", "*"]]
]);
var usurpMap = /* @__PURE__ */ new Map([
  ["!", /* @__PURE__ */ new Map([["!", "@"]])],
  [
    "?",
    /* @__PURE__ */ new Map([
      ["*", "*"],
      ["+", "*"]
    ])
  ],
  [
    "@",
    /* @__PURE__ */ new Map([
      ["!", "!"],
      ["?", "?"],
      ["@", "@"],
      ["*", "*"],
      ["+", "+"]
    ])
  ],
  [
    "+",
    /* @__PURE__ */ new Map([
      ["?", "*"],
      ["*", "*"]
    ])
  ]
]);
var startNoTraversal = "(?!(?:^|/)\\.\\.?(?:$|/))";
var startNoDot = "(?!\\.)";
var addPatternStart = /* @__PURE__ */ new Set(["[", "."]);
var justDots = /* @__PURE__ */ new Set(["..", "."]);
var reSpecials = new Set("().*{}+?[]^$\\!");
var regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var qmark = "[^/]";
var star = qmark + "*?";
var starNoEmpty = qmark + "+?";
var ID = 0;
var AST = class {
  type;
  #root;
  #hasMagic;
  #uflag = false;
  #parts = [];
  #parent;
  #parentIndex;
  #negs;
  #filledNegs = false;
  #options;
  #toString;
  // set to true if it's an extglob with no children
  // (which really means one child of '')
  #emptyExt = false;
  id = ++ID;
  get depth() {
    return (this.#parent?.depth ?? -1) + 1;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return {
      "@@type": "AST",
      id: this.id,
      type: this.type,
      root: this.#root.id,
      parent: this.#parent?.id,
      depth: this.depth,
      partsLength: this.#parts.length,
      parts: this.#parts
    };
  }
  constructor(type, parent, options = {}) {
    this.type = type;
    if (type)
      this.#hasMagic = true;
    this.#parent = parent;
    this.#root = this.#parent ? this.#parent.#root : this;
    this.#options = this.#root === this ? options : this.#root.#options;
    this.#negs = this.#root === this ? [] : this.#root.#negs;
    if (type === "!" && !this.#root.#filledNegs)
      this.#negs.push(this);
    this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
  }
  get hasMagic() {
    if (this.#hasMagic !== void 0)
      return this.#hasMagic;
    for (const p of this.#parts) {
      if (typeof p === "string")
        continue;
      if (p.type || p.hasMagic)
        return this.#hasMagic = true;
    }
    return this.#hasMagic;
  }
  // reconstructs the pattern
  toString() {
    return this.#toString !== void 0 ? this.#toString : !this.type ? this.#toString = this.#parts.map((p) => String(p)).join("") : this.#toString = this.type + "(" + this.#parts.map((p) => String(p)).join("|") + ")";
  }
  #fillNegs() {
    if (this !== this.#root)
      throw new Error("should only call on root");
    if (this.#filledNegs)
      return this;
    this.toString();
    this.#filledNegs = true;
    let n;
    while (n = this.#negs.pop()) {
      if (n.type !== "!")
        continue;
      let p = n;
      let pp = p.#parent;
      while (pp) {
        for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++) {
          for (const part of n.#parts) {
            if (typeof part === "string") {
              throw new Error("string part in extglob AST??");
            }
            part.copyIn(pp.#parts[i]);
          }
        }
        p = pp;
        pp = p.#parent;
      }
    }
    return this;
  }
  push(...parts) {
    for (const p of parts) {
      if (p === "")
        continue;
      if (typeof p !== "string" && !(p instanceof _a && p.#parent === this)) {
        throw new Error("invalid part: " + p);
      }
      this.#parts.push(p);
    }
  }
  toJSON() {
    const ret = this.type === null ? this.#parts.slice().map((p) => typeof p === "string" ? p : p.toJSON()) : [this.type, ...this.#parts.map((p) => p.toJSON())];
    if (this.isStart() && !this.type)
      ret.unshift([]);
    if (this.isEnd() && (this === this.#root || this.#root.#filledNegs && this.#parent?.type === "!")) {
      ret.push({});
    }
    return ret;
  }
  isStart() {
    if (this.#root === this)
      return true;
    if (!this.#parent?.isStart())
      return false;
    if (this.#parentIndex === 0)
      return true;
    const p = this.#parent;
    for (let i = 0; i < this.#parentIndex; i++) {
      const pp = p.#parts[i];
      if (!(pp instanceof _a && pp.type === "!")) {
        return false;
      }
    }
    return true;
  }
  isEnd() {
    if (this.#root === this)
      return true;
    if (this.#parent?.type === "!")
      return true;
    if (!this.#parent?.isEnd())
      return false;
    if (!this.type)
      return this.#parent?.isEnd();
    const pl = this.#parent ? this.#parent.#parts.length : 0;
    return this.#parentIndex === pl - 1;
  }
  copyIn(part) {
    if (typeof part === "string")
      this.push(part);
    else
      this.push(part.clone(this));
  }
  clone(parent) {
    const c = new _a(this.type, parent);
    for (const p of this.#parts) {
      c.copyIn(p);
    }
    return c;
  }
  static #parseAST(str, ast, pos, opt, extDepth) {
    const maxDepth = opt.maxExtglobRecursion ?? 2;
    let escaping = false;
    let inBrace = false;
    let braceStart = -1;
    let braceNeg = false;
    if (ast.type === null) {
      let i2 = pos;
      let acc2 = "";
      while (i2 < str.length) {
        const c = str.charAt(i2++);
        if (escaping || c === "\\") {
          escaping = !escaping;
          acc2 += c;
          continue;
        }
        if (inBrace) {
          if (i2 === braceStart + 1) {
            if (c === "^" || c === "!") {
              braceNeg = true;
            }
          } else if (c === "]" && !(i2 === braceStart + 2 && braceNeg)) {
            inBrace = false;
          }
          acc2 += c;
          continue;
        } else if (c === "[") {
          inBrace = true;
          braceStart = i2;
          braceNeg = false;
          acc2 += c;
          continue;
        }
        const doRecurse = !opt.noext && isExtglobType(c) && str.charAt(i2) === "(" && extDepth <= maxDepth;
        if (doRecurse) {
          ast.push(acc2);
          acc2 = "";
          const ext2 = new _a(c, ast);
          i2 = _a.#parseAST(str, ext2, i2, opt, extDepth + 1);
          ast.push(ext2);
          continue;
        }
        acc2 += c;
      }
      ast.push(acc2);
      return i2;
    }
    let i = pos + 1;
    let part = new _a(null, ast);
    const parts = [];
    let acc = "";
    while (i < str.length) {
      const c = str.charAt(i++);
      if (escaping || c === "\\") {
        escaping = !escaping;
        acc += c;
        continue;
      }
      if (inBrace) {
        if (i === braceStart + 1) {
          if (c === "^" || c === "!") {
            braceNeg = true;
          }
        } else if (c === "]" && !(i === braceStart + 2 && braceNeg)) {
          inBrace = false;
        }
        acc += c;
        continue;
      } else if (c === "[") {
        inBrace = true;
        braceStart = i;
        braceNeg = false;
        acc += c;
        continue;
      }
      const doRecurse = !opt.noext && isExtglobType(c) && str.charAt(i) === "(" && /* c8 ignore start - the maxDepth is sufficient here */
      (extDepth <= maxDepth || ast && ast.#canAdoptType(c));
      if (doRecurse) {
        const depthAdd = ast && ast.#canAdoptType(c) ? 0 : 1;
        part.push(acc);
        acc = "";
        const ext2 = new _a(c, part);
        part.push(ext2);
        i = _a.#parseAST(str, ext2, i, opt, extDepth + depthAdd);
        continue;
      }
      if (c === "|") {
        part.push(acc);
        acc = "";
        parts.push(part);
        part = new _a(null, ast);
        continue;
      }
      if (c === ")") {
        if (acc === "" && ast.#parts.length === 0) {
          ast.#emptyExt = true;
        }
        part.push(acc);
        acc = "";
        ast.push(...parts, part);
        return i;
      }
      acc += c;
    }
    ast.type = null;
    ast.#hasMagic = void 0;
    ast.#parts = [str.substring(pos - 1)];
    return i;
  }
  #canAdoptWithSpace(child) {
    return this.#canAdopt(child, adoptionWithSpaceMap);
  }
  #canAdopt(child, map = adoptionMap) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canAdoptType(gc.type, map);
  }
  #canAdoptType(c, map = adoptionAnyMap) {
    return !!map.get(this.type)?.includes(c);
  }
  #adoptWithSpace(child, index) {
    const gc = child.#parts[0];
    const blank = new _a(null, gc, this.options);
    blank.#parts.push("");
    gc.push(blank);
    this.#adopt(child, index);
  }
  #adopt(child, index) {
    const gc = child.#parts[0];
    this.#parts.splice(index, 1, ...gc.#parts);
    for (const p of gc.#parts) {
      if (typeof p === "object")
        p.#parent = this;
    }
    this.#toString = void 0;
  }
  #canUsurpType(c) {
    const m = usurpMap.get(this.type);
    return !!m?.has(c);
  }
  #canUsurp(child) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null || this.#parts.length !== 1) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canUsurpType(gc.type);
  }
  #usurp(child) {
    const m = usurpMap.get(this.type);
    const gc = child.#parts[0];
    const nt = m?.get(gc.type);
    if (!nt)
      return false;
    this.#parts = gc.#parts;
    for (const p of this.#parts) {
      if (typeof p === "object") {
        p.#parent = this;
      }
    }
    this.type = nt;
    this.#toString = void 0;
    this.#emptyExt = false;
  }
  static fromGlob(pattern, options = {}) {
    const ast = new _a(null, void 0, options);
    _a.#parseAST(pattern, ast, 0, options, 0);
    return ast;
  }
  // returns the regular expression if there's magic, or the unescaped
  // string if not.
  toMMPattern() {
    if (this !== this.#root)
      return this.#root.toMMPattern();
    const glob = this.toString();
    const [re, body, hasMagic, uflag] = this.toRegExpSource();
    const anyMagic = hasMagic || this.#hasMagic || this.#options.nocase && !this.#options.nocaseMagicOnly && glob.toUpperCase() !== glob.toLowerCase();
    if (!anyMagic) {
      return body;
    }
    const flags = (this.#options.nocase ? "i" : "") + (uflag ? "u" : "");
    return Object.assign(new RegExp(`^${re}$`, flags), {
      _src: re,
      _glob: glob
    });
  }
  get options() {
    return this.#options;
  }
  // returns the string match, the regexp source, whether there's magic
  // in the regexp (so a regular expression is required) and whether or
  // not the uflag is needed for the regular expression (for posix classes)
  // TODO: instead of injecting the start/end at this point, just return
  // the BODY of the regexp, along with the start/end portions suitable
  // for binding the start/end in either a joined full-path makeRe context
  // (where we bind to (^|/), or a standalone matchPart context (where
  // we bind to ^, and not /).  Otherwise slashes get duped!
  //
  // In part-matching mode, the start is:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: ^(?!\.\.?$)
  // - if dots allowed or not possible: ^
  // - if dots possible and not allowed: ^(?!\.)
  // end is:
  // - if not isEnd(): nothing
  // - else: $
  //
  // In full-path matching mode, we put the slash at the START of the
  // pattern, so start is:
  // - if first pattern: same as part-matching mode
  // - if not isStart(): nothing
  // - if traversal possible, but not allowed: /(?!\.\.?(?:$|/))
  // - if dots allowed or not possible: /
  // - if dots possible and not allowed: /(?!\.)
  // end is:
  // - if last pattern, same as part-matching mode
  // - else nothing
  //
  // Always put the (?:$|/) on negated tails, though, because that has to be
  // there to bind the end of the negated pattern portion, and it's easier to
  // just stick it in now rather than try to inject it later in the middle of
  // the pattern.
  //
  // We can just always return the same end, and leave it up to the caller
  // to know whether it's going to be used joined or in parts.
  // And, if the start is adjusted slightly, can do the same there:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: (?:/|^)(?!\.\.?$)
  // - if dots allowed or not possible: (?:/|^)
  // - if dots possible and not allowed: (?:/|^)(?!\.)
  //
  // But it's better to have a simpler binding without a conditional, for
  // performance, so probably better to return both start options.
  //
  // Then the caller just ignores the end if it's not the first pattern,
  // and the start always gets applied.
  //
  // But that's always going to be $ if it's the ending pattern, or nothing,
  // so the caller can just attach $ at the end of the pattern when building.
  //
  // So the todo is:
  // - better detect what kind of start is needed
  // - return both flavors of starting pattern
  // - attach $ at the end of the pattern when creating the actual RegExp
  //
  // Ah, but wait, no, that all only applies to the root when the first pattern
  // is not an extglob. If the first pattern IS an extglob, then we need all
  // that dot prevention biz to live in the extglob portions, because eg
  // +(*|.x*) can match .xy but not .yx.
  //
  // So, return the two flavors if it's #root and the first child is not an
  // AST, otherwise leave it to the child AST to handle it, and there,
  // use the (?:^|/) style of start binding.
  //
  // Even simplified further:
  // - Since the start for a join is eg /(?!\.) and the start for a part
  // is ^(?!\.), we can just prepend (?!\.) to the pattern (either root
  // or start or whatever) and prepend ^ or / at the Regexp construction.
  toRegExpSource(allowDot) {
    const dot = allowDot ?? !!this.#options.dot;
    if (this.#root === this) {
      this.#flatten();
      this.#fillNegs();
    }
    if (!isExtglobAST(this)) {
      const noEmpty = this.isStart() && this.isEnd() && !this.#parts.some((s) => typeof s !== "string");
      const src = this.#parts.map((p) => {
        const [re, _, hasMagic, uflag] = typeof p === "string" ? _a.#parseGlob(p, this.#hasMagic, noEmpty) : p.toRegExpSource(allowDot);
        this.#hasMagic = this.#hasMagic || hasMagic;
        this.#uflag = this.#uflag || uflag;
        return re;
      }).join("");
      let start2 = "";
      if (this.isStart()) {
        if (typeof this.#parts[0] === "string") {
          const dotTravAllowed = this.#parts.length === 1 && justDots.has(this.#parts[0]);
          if (!dotTravAllowed) {
            const aps = addPatternStart;
            const needNoTrav = (
              // dots are allowed, and the pattern starts with [ or .
              dot && aps.has(src.charAt(0)) || // the pattern starts with \., and then [ or .
              src.startsWith("\\.") && aps.has(src.charAt(2)) || // the pattern starts with \.\., and then [ or .
              src.startsWith("\\.\\.") && aps.has(src.charAt(4))
            );
            const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
            start2 = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : "";
          }
        }
      }
      let end = "";
      if (this.isEnd() && this.#root.#filledNegs && this.#parent?.type === "!") {
        end = "(?:$|\\/)";
      }
      const final2 = start2 + src + end;
      return [
        final2,
        unescape(src),
        this.#hasMagic = !!this.#hasMagic,
        this.#uflag
      ];
    }
    const repeated = this.type === "*" || this.type === "+";
    const start = this.type === "!" ? "(?:(?!(?:" : "(?:";
    let body = this.#partsToRegExp(dot);
    if (this.isStart() && this.isEnd() && !body && this.type !== "!") {
      const s = this.toString();
      const me = this;
      me.#parts = [s];
      me.type = null;
      me.#hasMagic = void 0;
      return [s, unescape(this.toString()), false, false];
    }
    let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot ? "" : this.#partsToRegExp(true);
    if (bodyDotAllowed === body) {
      bodyDotAllowed = "";
    }
    if (bodyDotAllowed) {
      body = `(?:${body})(?:${bodyDotAllowed})*?`;
    }
    let final = "";
    if (this.type === "!" && this.#emptyExt) {
      final = (this.isStart() && !dot ? startNoDot : "") + starNoEmpty;
    } else {
      const close = this.type === "!" ? (
        // !() must match something,but !(x) can match ''
        "))" + (this.isStart() && !dot && !allowDot ? startNoDot : "") + star + ")"
      ) : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && bodyDotAllowed ? ")" : this.type === "*" && bodyDotAllowed ? `)?` : `)${this.type}`;
      final = start + body + close;
    }
    return [
      final,
      unescape(body),
      this.#hasMagic = !!this.#hasMagic,
      this.#uflag
    ];
  }
  #flatten() {
    if (!isExtglobAST(this)) {
      for (const p of this.#parts) {
        if (typeof p === "object") {
          p.#flatten();
        }
      }
    } else {
      let iterations = 0;
      let done = false;
      do {
        done = true;
        for (let i = 0; i < this.#parts.length; i++) {
          const c = this.#parts[i];
          if (typeof c === "object") {
            c.#flatten();
            if (this.#canAdopt(c)) {
              done = false;
              this.#adopt(c, i);
            } else if (this.#canAdoptWithSpace(c)) {
              done = false;
              this.#adoptWithSpace(c, i);
            } else if (this.#canUsurp(c)) {
              done = false;
              this.#usurp(c);
            }
          }
        }
      } while (!done && ++iterations < 10);
    }
    this.#toString = void 0;
  }
  #partsToRegExp(dot) {
    return this.#parts.map((p) => {
      if (typeof p === "string") {
        throw new Error("string type in extglob ast??");
      }
      const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
      this.#uflag = this.#uflag || uflag;
      return re;
    }).filter((p) => !(this.isStart() && this.isEnd()) || !!p).join("|");
  }
  static #parseGlob(glob, hasMagic, noEmpty = false) {
    let escaping = false;
    let re = "";
    let uflag = false;
    let inStar = false;
    for (let i = 0; i < glob.length; i++) {
      const c = glob.charAt(i);
      if (escaping) {
        escaping = false;
        re += (reSpecials.has(c) ? "\\" : "") + c;
        continue;
      }
      if (c === "*") {
        if (inStar)
          continue;
        inStar = true;
        re += noEmpty && /^[*]+$/.test(glob) ? starNoEmpty : star;
        hasMagic = true;
        continue;
      } else {
        inStar = false;
      }
      if (c === "\\") {
        if (i === glob.length - 1) {
          re += "\\\\";
        } else {
          escaping = true;
        }
        continue;
      }
      if (c === "[") {
        const [src, needUflag, consumed, magic] = parseClass(glob, i);
        if (consumed) {
          re += src;
          uflag = uflag || needUflag;
          i += consumed - 1;
          hasMagic = hasMagic || magic;
          continue;
        }
      }
      if (c === "?") {
        re += qmark;
        hasMagic = true;
        continue;
      }
      re += regExpEscape(c);
    }
    return [re, unescape(glob), !!hasMagic, uflag];
  }
};
_a = AST;

// node_modules/minimatch/dist/esm/escape.js
var escape = (s, { windowsPathsNoEscape = false, magicalBraces = false } = {}) => {
  if (magicalBraces) {
    return windowsPathsNoEscape ? s.replace(/[?*()[\]{}]/g, "[$&]") : s.replace(/[?*()[\]\\{}]/g, "\\$&");
  }
  return windowsPathsNoEscape ? s.replace(/[?*()[\]]/g, "[$&]") : s.replace(/[?*()[\]\\]/g, "\\$&");
};

// node_modules/minimatch/dist/esm/index.js
var minimatch = (p, pattern, options = {}) => {
  assertValidPattern(pattern);
  if (!options.nocomment && pattern.charAt(0) === "#") {
    return false;
  }
  return new Minimatch(pattern, options).match(p);
};
var starDotExtRE = /^\*+([^+@!?*[(]*)$/;
var starDotExtTest = (ext2) => (f) => !f.startsWith(".") && f.endsWith(ext2);
var starDotExtTestDot = (ext2) => (f) => f.endsWith(ext2);
var starDotExtTestNocase = (ext2) => {
  ext2 = ext2.toLowerCase();
  return (f) => !f.startsWith(".") && f.toLowerCase().endsWith(ext2);
};
var starDotExtTestNocaseDot = (ext2) => {
  ext2 = ext2.toLowerCase();
  return (f) => f.toLowerCase().endsWith(ext2);
};
var starDotStarRE = /^\*+\.\*+$/;
var starDotStarTest = (f) => !f.startsWith(".") && f.includes(".");
var starDotStarTestDot = (f) => f !== "." && f !== ".." && f.includes(".");
var dotStarRE = /^\.\*+$/;
var dotStarTest = (f) => f !== "." && f !== ".." && f.startsWith(".");
var starRE = /^\*+$/;
var starTest = (f) => f.length !== 0 && !f.startsWith(".");
var starTestDot = (f) => f.length !== 0 && f !== "." && f !== "..";
var qmarksRE = /^\?+([^+@!?*[(]*)?$/;
var qmarksTestNocase = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  if (!ext2)
    return noext;
  ext2 = ext2.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext2);
};
var qmarksTestNocaseDot = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  if (!ext2)
    return noext;
  ext2 = ext2.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext2);
};
var qmarksTestDot = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  return !ext2 ? noext : (f) => noext(f) && f.endsWith(ext2);
};
var qmarksTest = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  return !ext2 ? noext : (f) => noext(f) && f.endsWith(ext2);
};
var qmarksTestNoExt = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && !f.startsWith(".");
};
var qmarksTestNoExtDot = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && f !== "." && f !== "..";
};
var defaultPlatform = typeof process === "object" && process ? typeof process.env === "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
var path = {
  win32: { sep: "\\" },
  posix: { sep: "/" }
};
var sep = defaultPlatform === "win32" ? path.win32.sep : path.posix.sep;
minimatch.sep = sep;
var GLOBSTAR = Symbol("globstar **");
minimatch.GLOBSTAR = GLOBSTAR;
var qmark2 = "[^/]";
var star2 = qmark2 + "*?";
var twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
var twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
var filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
var ext = (a, b = {}) => Object.assign({}, a, b);
var defaults = (def) => {
  if (!def || typeof def !== "object" || !Object.keys(def).length) {
    return minimatch;
  }
  const orig = minimatch;
  const m = (p, pattern, options = {}) => orig(p, pattern, ext(def, options));
  return Object.assign(m, {
    Minimatch: class Minimatch extends orig.Minimatch {
      constructor(pattern, options = {}) {
        super(pattern, ext(def, options));
      }
      static defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      }
    },
    AST: class AST extends orig.AST {
      /* c8 ignore start */
      constructor(type, parent, options = {}) {
        super(type, parent, ext(def, options));
      }
      /* c8 ignore stop */
      static fromGlob(pattern, options = {}) {
        return orig.AST.fromGlob(pattern, ext(def, options));
      }
    },
    unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
    escape: (s, options = {}) => orig.escape(s, ext(def, options)),
    filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
    defaults: (options) => orig.defaults(ext(def, options)),
    makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
    braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
    match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
    sep: orig.sep,
    GLOBSTAR
  });
};
minimatch.defaults = defaults;
var braceExpand = (pattern, options = {}) => {
  assertValidPattern(pattern);
  if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
    return [pattern];
  }
  return expand(pattern, { max: options.braceExpandMax });
};
minimatch.braceExpand = braceExpand;
var makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
var match = (list, pattern, options = {}) => {
  const mm = new Minimatch(pattern, options);
  list = list.filter((f) => mm.match(f));
  if (mm.options.nonull && !list.length) {
    list.push(pattern);
  }
  return list;
};
minimatch.match = match;
var globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
var regExpEscape2 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var Minimatch = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  maxGlobstarRecursion;
  regexp;
  constructor(pattern, options = {}) {
    assertValidPattern(pattern);
    options = options || {};
    this.options = options;
    this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200;
    this.pattern = pattern;
    this.platform = options.platform || defaultPlatform;
    this.isWindows = this.platform === "win32";
    const awe = "allowWindowsEscape";
    this.windowsPathsNoEscape = !!options.windowsPathsNoEscape || options[awe] === false;
    if (this.windowsPathsNoEscape) {
      this.pattern = this.pattern.replace(/\\/g, "/");
    }
    this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
    this.regexp = null;
    this.negate = false;
    this.nonegate = !!options.nonegate;
    this.comment = false;
    this.empty = false;
    this.partial = !!options.partial;
    this.nocase = !!this.options.nocase;
    this.windowsNoMagicRoot = options.windowsNoMagicRoot !== void 0 ? options.windowsNoMagicRoot : !!(this.isWindows && this.nocase);
    this.globSet = [];
    this.globParts = [];
    this.set = [];
    this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) {
      return true;
    }
    for (const pattern of this.set) {
      for (const part of pattern) {
        if (typeof part !== "string")
          return true;
      }
    }
    return false;
  }
  debug(..._) {
  }
  make() {
    const pattern = this.pattern;
    const options = this.options;
    if (!options.nocomment && pattern.charAt(0) === "#") {
      this.comment = true;
      return;
    }
    if (!pattern) {
      this.empty = true;
      return;
    }
    this.parseNegate();
    this.globSet = [...new Set(this.braceExpand())];
    if (options.debug) {
      this.debug = (...args) => console.error(...args);
    }
    this.debug(this.pattern, this.globSet);
    const rawGlobParts = this.globSet.map((s) => this.slashSplit(s));
    this.globParts = this.preprocess(rawGlobParts);
    this.debug(this.pattern, this.globParts);
    let set = this.globParts.map((s, _, __) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        const isUNC = s[0] === "" && s[1] === "" && (s[2] === "?" || !globMagic.test(s[2])) && !globMagic.test(s[3]);
        const isDrive = /^[a-z]:/i.test(s[0]);
        if (isUNC) {
          return [
            ...s.slice(0, 4),
            ...s.slice(4).map((ss) => this.parse(ss))
          ];
        } else if (isDrive) {
          return [s[0], ...s.slice(1).map((ss) => this.parse(ss))];
        }
      }
      return s.map((ss) => this.parse(ss));
    });
    this.debug(this.pattern, set);
    this.set = set.filter((s) => s.indexOf(false) === -1);
    if (this.isWindows) {
      for (let i = 0; i < this.set.length; i++) {
        const p = this.set[i];
        if (p[0] === "" && p[1] === "" && this.globParts[i][2] === "?" && typeof p[3] === "string" && /^[a-z]:$/i.test(p[3])) {
          p[2] = "?";
        }
      }
    }
    this.debug(this.pattern, this.set);
  }
  // various transforms to equivalent pattern sets that are
  // faster to process in a filesystem walk.  The goal is to
  // eliminate what we can, and push all ** patterns as far
  // to the right as possible, even if it increases the number
  // of patterns that we have to process.
  preprocess(globParts) {
    if (this.options.noglobstar) {
      for (const partset of globParts) {
        for (let j = 0; j < partset.length; j++) {
          if (partset[j] === "**") {
            partset[j] = "*";
          }
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      globParts = this.firstPhasePreProcess(globParts);
      globParts = this.secondPhasePreProcess(globParts);
    } else if (optimizationLevel >= 1) {
      globParts = this.levelOneOptimize(globParts);
    } else {
      globParts = this.adjascentGlobstarOptimize(globParts);
    }
    return globParts;
  }
  // just get rid of adjascent ** portions
  adjascentGlobstarOptimize(globParts) {
    return globParts.map((parts) => {
      let gs = -1;
      while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
        let i = gs;
        while (parts[i + 1] === "**") {
          i++;
        }
        if (i !== gs) {
          parts.splice(gs, i - gs);
        }
      }
      return parts;
    });
  }
  // get rid of adjascent ** and resolve .. portions
  levelOneOptimize(globParts) {
    return globParts.map((parts) => {
      parts = parts.reduce((set, part) => {
        const prev = set[set.length - 1];
        if (part === "**" && prev === "**") {
          return set;
        }
        if (part === "..") {
          if (prev && prev !== ".." && prev !== "." && prev !== "**") {
            set.pop();
            return set;
          }
        }
        set.push(part);
        return set;
      }, []);
      return parts.length === 0 ? [""] : parts;
    });
  }
  levelTwoFileOptimize(parts) {
    if (!Array.isArray(parts)) {
      parts = this.slashSplit(parts);
    }
    let didSomething = false;
    do {
      didSomething = false;
      if (!this.preserveMultipleSlashes) {
        for (let i = 1; i < parts.length - 1; i++) {
          const p = parts[i];
          if (i === 1 && p === "" && parts[0] === "")
            continue;
          if (p === "." || p === "") {
            didSomething = true;
            parts.splice(i, 1);
            i--;
          }
        }
        if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
          didSomething = true;
          parts.pop();
        }
      }
      let dd = 0;
      while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
        const p = parts[dd - 1];
        if (p && p !== "." && p !== ".." && p !== "**" && !(this.isWindows && /^[a-z]:$/i.test(p))) {
          didSomething = true;
          parts.splice(dd - 1, 2);
          dd -= 2;
        }
      }
    } while (didSomething);
    return parts.length === 0 ? [""] : parts;
  }
  // First phase: single-pattern processing
  // <pre> is 1 or more portions
  // <rest> is 1 or more portions
  // <p> is any portion other than ., .., '', or **
  // <e> is . or ''
  //
  // **/.. is *brutal* for filesystem walking performance, because
  // it effectively resets the recursive walk each time it occurs,
  // and ** cannot be reduced out by a .. pattern part like a regexp
  // or most strings (other than .., ., and '') can be.
  //
  // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
  // <pre>/<e>/<rest> -> <pre>/<rest>
  // <pre>/<p>/../<rest> -> <pre>/<rest>
  // **/**/<rest> -> **/<rest>
  //
  // **/*/<rest> -> */**/<rest> <== not valid because ** doesn't follow
  // this WOULD be allowed if ** did follow symlinks, or * didn't
  firstPhasePreProcess(globParts) {
    let didSomething = false;
    do {
      didSomething = false;
      for (let parts of globParts) {
        let gs = -1;
        while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
          let gss = gs;
          while (parts[gss + 1] === "**") {
            gss++;
          }
          if (gss > gs) {
            parts.splice(gs + 1, gss - gs);
          }
          let next = parts[gs + 1];
          const p = parts[gs + 2];
          const p2 = parts[gs + 3];
          if (next !== "..")
            continue;
          if (!p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..") {
            continue;
          }
          didSomething = true;
          parts.splice(gs, 1);
          const other = parts.slice(0);
          other[gs] = "**";
          globParts.push(other);
          gs--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let i = 1; i < parts.length - 1; i++) {
            const p = parts[i];
            if (i === 1 && p === "" && parts[0] === "")
              continue;
            if (p === "." || p === "") {
              didSomething = true;
              parts.splice(i, 1);
              i--;
            }
          }
          if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
            didSomething = true;
            parts.pop();
          }
        }
        let dd = 0;
        while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
          const p = parts[dd - 1];
          if (p && p !== "." && p !== ".." && p !== "**") {
            didSomething = true;
            const needDot = dd === 1 && parts[dd + 1] === "**";
            const splin = needDot ? ["."] : [];
            parts.splice(dd - 1, 2, ...splin);
            if (parts.length === 0)
              parts.push("");
            dd -= 2;
          }
        }
      }
    } while (didSomething);
    return globParts;
  }
  // second phase: multi-pattern dedupes
  // {<pre>/*/<rest>,<pre>/<p>/<rest>} -> <pre>/*/<rest>
  // {<pre>/<rest>,<pre>/<rest>} -> <pre>/<rest>
  // {<pre>/**/<rest>,<pre>/<rest>} -> <pre>/**/<rest>
  //
  // {<pre>/**/<rest>,<pre>/**/<p>/<rest>} -> <pre>/**/<rest>
  // ^-- not valid because ** doens't follow symlinks
  secondPhasePreProcess(globParts) {
    for (let i = 0; i < globParts.length - 1; i++) {
      for (let j = i + 1; j < globParts.length; j++) {
        const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
        if (matched) {
          globParts[i] = [];
          globParts[j] = matched;
          break;
        }
      }
    }
    return globParts.filter((gs) => gs.length);
  }
  partsMatch(a, b, emptyGSMatch = false) {
    let ai = 0;
    let bi = 0;
    let result = [];
    let which = "";
    while (ai < a.length && bi < b.length) {
      if (a[ai] === b[bi]) {
        result.push(which === "b" ? b[bi] : a[ai]);
        ai++;
        bi++;
      } else if (emptyGSMatch && a[ai] === "**" && b[bi] === a[ai + 1]) {
        result.push(a[ai]);
        ai++;
      } else if (emptyGSMatch && b[bi] === "**" && a[ai] === b[bi + 1]) {
        result.push(b[bi]);
        bi++;
      } else if (a[ai] === "*" && b[bi] && (this.options.dot || !b[bi].startsWith(".")) && b[bi] !== "**") {
        if (which === "b")
          return false;
        which = "a";
        result.push(a[ai]);
        ai++;
        bi++;
      } else if (b[bi] === "*" && a[ai] && (this.options.dot || !a[ai].startsWith(".")) && a[ai] !== "**") {
        if (which === "a")
          return false;
        which = "b";
        result.push(b[bi]);
        ai++;
        bi++;
      } else {
        return false;
      }
    }
    return a.length === b.length && result;
  }
  parseNegate() {
    if (this.nonegate)
      return;
    const pattern = this.pattern;
    let negate = false;
    let negateOffset = 0;
    for (let i = 0; i < pattern.length && pattern.charAt(i) === "!"; i++) {
      negate = !negate;
      negateOffset++;
    }
    if (negateOffset)
      this.pattern = pattern.slice(negateOffset);
    this.negate = negate;
  }
  // set partial to true to test if, for example,
  // "/a/b" matches the start of "/*/b/*/d"
  // Partial means, if you run out of file before you run
  // out of pattern, then that's fine, as long as all
  // the parts match.
  matchOne(file, pattern, partial = false) {
    let fileStartIndex = 0;
    let patternStartIndex = 0;
    if (this.isWindows) {
      const fileDrive = typeof file[0] === "string" && /^[a-z]:$/i.test(file[0]);
      const fileUNC = !fileDrive && file[0] === "" && file[1] === "" && file[2] === "?" && /^[a-z]:$/i.test(file[3]);
      const patternDrive = typeof pattern[0] === "string" && /^[a-z]:$/i.test(pattern[0]);
      const patternUNC = !patternDrive && pattern[0] === "" && pattern[1] === "" && pattern[2] === "?" && typeof pattern[3] === "string" && /^[a-z]:$/i.test(pattern[3]);
      const fdi = fileUNC ? 3 : fileDrive ? 0 : void 0;
      const pdi = patternUNC ? 3 : patternDrive ? 0 : void 0;
      if (typeof fdi === "number" && typeof pdi === "number") {
        const [fd, pd] = [
          file[fdi],
          pattern[pdi]
        ];
        if (fd.toLowerCase() === pd.toLowerCase()) {
          pattern[pdi] = fd;
          patternStartIndex = pdi;
          fileStartIndex = fdi;
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      file = this.levelTwoFileOptimize(file);
    }
    if (pattern.includes(GLOBSTAR)) {
      return this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex);
    }
    return this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
  }
  #matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
    const firstgs = pattern.indexOf(GLOBSTAR, patternIndex);
    const lastgs = pattern.lastIndexOf(GLOBSTAR);
    const [head, body, tail] = partial ? [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1),
      []
    ] : [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1, lastgs),
      pattern.slice(lastgs + 1)
    ];
    if (head.length) {
      const fileHead = file.slice(fileIndex, fileIndex + head.length);
      if (!this.#matchOne(fileHead, head, partial, 0, 0)) {
        return false;
      }
      fileIndex += head.length;
      patternIndex += head.length;
    }
    let fileTailMatch = 0;
    if (tail.length) {
      if (tail.length + fileIndex > file.length)
        return false;
      let tailStart = file.length - tail.length;
      if (this.#matchOne(file, tail, partial, tailStart, 0)) {
        fileTailMatch = tail.length;
      } else {
        if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) {
          return false;
        }
        tailStart--;
        if (!this.#matchOne(file, tail, partial, tailStart, 0)) {
          return false;
        }
        fileTailMatch = tail.length + 1;
      }
    }
    if (!body.length) {
      let sawSome = !!fileTailMatch;
      for (let i2 = fileIndex; i2 < file.length - fileTailMatch; i2++) {
        const f = String(file[i2]);
        sawSome = true;
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return partial || sawSome;
    }
    const bodySegments = [[[], 0]];
    let currentBody = bodySegments[0];
    let nonGsParts = 0;
    const nonGsPartsSums = [0];
    for (const b of body) {
      if (b === GLOBSTAR) {
        nonGsPartsSums.push(nonGsParts);
        currentBody = [[], 0];
        bodySegments.push(currentBody);
      } else {
        currentBody[0].push(b);
        nonGsParts++;
      }
    }
    let i = bodySegments.length - 1;
    const fileLength = file.length - fileTailMatch;
    for (const b of bodySegments) {
      b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
    }
    return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
  }
  // return false for "nope, not matching"
  // return null for "not matching, cannot keep trying"
  #matchGlobStarBodySections(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
    const bs = bodySegments[bodyIndex];
    if (!bs) {
      for (let i = fileIndex; i < file.length; i++) {
        sawTail = true;
        const f = file[i];
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return sawTail;
    }
    const [body, after] = bs;
    while (fileIndex <= after) {
      const m = this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0);
      if (m && globStarDepth < this.maxGlobstarRecursion) {
        const sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
        if (sub !== false) {
          return sub;
        }
      }
      const f = file[fileIndex];
      if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
        return false;
      }
      fileIndex++;
    }
    return partial || null;
  }
  #matchOne(file, pattern, partial, fileIndex, patternIndex) {
    let fi;
    let pi;
    let pl;
    let fl;
    for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
      this.debug("matchOne loop");
      let p = pattern[pi];
      let f = file[fi];
      this.debug(pattern, p, f);
      if (p === false || p === GLOBSTAR) {
        return false;
      }
      let hit;
      if (typeof p === "string") {
        hit = f === p;
        this.debug("string match", p, f, hit);
      } else {
        hit = p.test(f);
        this.debug("pattern match", p, f, hit);
      }
      if (!hit)
        return false;
    }
    if (fi === fl && pi === pl) {
      return true;
    } else if (fi === fl) {
      return partial;
    } else if (pi === pl) {
      return fi === fl - 1 && file[fi] === "";
    } else {
      throw new Error("wtf?");
    }
  }
  braceExpand() {
    return braceExpand(this.pattern, this.options);
  }
  parse(pattern) {
    assertValidPattern(pattern);
    const options = this.options;
    if (pattern === "**")
      return GLOBSTAR;
    if (pattern === "")
      return "";
    let m;
    let fastTest = null;
    if (m = pattern.match(starRE)) {
      fastTest = options.dot ? starTestDot : starTest;
    } else if (m = pattern.match(starDotExtRE)) {
      fastTest = (options.nocase ? options.dot ? starDotExtTestNocaseDot : starDotExtTestNocase : options.dot ? starDotExtTestDot : starDotExtTest)(m[1]);
    } else if (m = pattern.match(qmarksRE)) {
      fastTest = (options.nocase ? options.dot ? qmarksTestNocaseDot : qmarksTestNocase : options.dot ? qmarksTestDot : qmarksTest)(m);
    } else if (m = pattern.match(starDotStarRE)) {
      fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
    } else if (m = pattern.match(dotStarRE)) {
      fastTest = dotStarTest;
    }
    const re = AST.fromGlob(pattern, this.options).toMMPattern();
    if (fastTest && typeof re === "object") {
      Reflect.defineProperty(re, "test", { value: fastTest });
    }
    return re;
  }
  makeRe() {
    if (this.regexp || this.regexp === false)
      return this.regexp;
    const set = this.set;
    if (!set.length) {
      this.regexp = false;
      return this.regexp;
    }
    const options = this.options;
    const twoStar = options.noglobstar ? star2 : options.dot ? twoStarDot : twoStarNoDot;
    const flags = new Set(options.nocase ? ["i"] : []);
    let re = set.map((pattern) => {
      const pp = pattern.map((p) => {
        if (p instanceof RegExp) {
          for (const f of p.flags.split(""))
            flags.add(f);
        }
        return typeof p === "string" ? regExpEscape2(p) : p === GLOBSTAR ? GLOBSTAR : p._src;
      });
      pp.forEach((p, i) => {
        const next = pp[i + 1];
        const prev = pp[i - 1];
        if (p !== GLOBSTAR || prev === GLOBSTAR) {
          return;
        }
        if (prev === void 0) {
          if (next !== void 0 && next !== GLOBSTAR) {
            pp[i + 1] = "(?:\\/|" + twoStar + "\\/)?" + next;
          } else {
            pp[i] = twoStar;
          }
        } else if (next === void 0) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + ")?";
        } else if (next !== GLOBSTAR) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + "\\/)" + next;
          pp[i + 1] = GLOBSTAR;
        }
      });
      const filtered = pp.filter((p) => p !== GLOBSTAR);
      if (this.partial && filtered.length >= 1) {
        const prefixes = [];
        for (let i = 1; i <= filtered.length; i++) {
          prefixes.push(filtered.slice(0, i).join("/"));
        }
        return "(?:" + prefixes.join("|") + ")";
      }
      return filtered.join("/");
    }).join("|");
    const [open, close] = set.length > 1 ? ["(?:", ")"] : ["", ""];
    re = "^" + open + re + close + "$";
    if (this.partial) {
      re = "^(?:\\/|" + open + re.slice(1, -1) + close + ")$";
    }
    if (this.negate)
      re = "^(?!" + re + ").+$";
    try {
      this.regexp = new RegExp(re, [...flags].join(""));
    } catch {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(p) {
    if (this.preserveMultipleSlashes) {
      return p.split("/");
    } else if (this.isWindows && /^\/\/[^/]+/.test(p)) {
      return ["", ...p.split(/\/+/)];
    } else {
      return p.split(/\/+/);
    }
  }
  match(f, partial = this.partial) {
    this.debug("match", f, this.pattern);
    if (this.comment) {
      return false;
    }
    if (this.empty) {
      return f === "";
    }
    if (f === "/" && partial) {
      return true;
    }
    const options = this.options;
    if (this.isWindows) {
      f = f.split("\\").join("/");
    }
    const ff = this.slashSplit(f);
    this.debug(this.pattern, "split", ff);
    const set = this.set;
    this.debug(this.pattern, "set", set);
    let filename = ff[ff.length - 1];
    if (!filename) {
      for (let i = ff.length - 2; !filename && i >= 0; i--) {
        filename = ff[i];
      }
    }
    for (const pattern of set) {
      let file = ff;
      if (options.matchBase && pattern.length === 1) {
        file = [filename];
      }
      const hit = this.matchOne(file, pattern, partial);
      if (hit) {
        if (options.flipNegate) {
          return true;
        }
        return !this.negate;
      }
    }
    if (options.flipNegate) {
      return false;
    }
    return this.negate;
  }
  static defaults(def) {
    return minimatch.defaults(def).Minimatch;
  }
};
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;

// src/audit.ts
var import_node_crypto = require("node:crypto");

// src/scanner.ts
var import_promises2 = require("node:fs/promises");
var import_node_os = require("node:os");
var import_node_path2 = require("node:path");
var import_semver = __toESM(require_semver2(), 1);

// src/process.ts
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
async function runCommand(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeoutMs ?? 15e3,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
      windowsHide: true
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    if (options.allowFailure) return null;
    const detail = error instanceof Error ? error.message.replaceAll(/Authorization:[^\n]+/gi, "Authorization: [redacted]") : String(error);
    throw new Error(`Command failed: ${command} (${detail})`);
  }
}

// src/scanner.ts
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
  "",
  ".c",
  ".cc",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".go",
  ".graphql",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".kts",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".pl",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh"
]);
var SAFE_ENV_EXAMPLES = /* @__PURE__ */ new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.defaults"
]);
function normalizePath(path2) {
  return path2.split(import_node_path2.sep).join("/");
}
function isExcludedPath(path2, patterns) {
  return patterns.some(
    (pattern) => minimatch(path2, pattern, {
      dot: true,
      matchBase: !pattern.includes("/"),
      nocase: false
    })
  );
}
function githubCoordinates(input2) {
  const trimmed = input2.trim();
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(trimmed);
  if (ssh?.[1] && ssh[2]) {
    const owner2 = ssh[1];
    const repo2 = ssh[2];
    return { owner: owner2, repo: repo2, url: `https://github.com/${owner2}/${repo2}` };
  }
  let pathname = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname.toLowerCase() !== "github.com") return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  } else if (trimmed.startsWith("github.com/")) {
    pathname = trimmed.slice("github.com/".length);
  } else if (!/^[^/\s]+\/[^/\s]+(?:\.git)?$/.test(trimmed)) {
    return null;
  }
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (!parts[0] || !parts[1]) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}
async function pathIsDirectory(path2) {
  try {
    return (await (0, import_promises2.stat)(path2)).isDirectory();
  } catch {
    return false;
  }
}
async function localGitHubRemote(root) {
  const topLevel = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    allowFailure: true
  });
  if (!topLevel) return null;
  if ((0, import_node_path2.resolve)(topLevel.stdout.trim()) !== (0, import_node_path2.resolve)(root)) {
    const scopedFiles = await runCommand("git", ["ls-files", "-z"], {
      cwd: root,
      allowFailure: true
    });
    if (!scopedFiles?.stdout) return null;
  }
  const result = await runCommand("git", ["remote", "get-url", "origin"], {
    cwd: root,
    allowFailure: true
  });
  return result ? githubCoordinates(result.stdout.trim()) : null;
}
async function prepareRepository(target, githubToken) {
  if (/^https?:\/\//i.test(target)) {
    try {
      const parsedTarget = new URL(target);
      if (parsedTarget.username || parsedTarget.password || parsedTarget.search) {
        throw new Error(
          "Credentials and query parameters in repository URLs are not accepted; use --token-env."
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Credentials and query parameters")) {
        throw error;
      }
    }
  }
  const localPath = (0, import_node_path2.resolve)(target);
  if (await pathIsDirectory(localPath)) {
    const github2 = await localGitHubRemote(localPath);
    return {
      identity: {
        input: target,
        kind: "local",
        name: (0, import_node_path2.basename)(localPath),
        localPath,
        github: github2
      },
      cleanup: async () => {
      }
    };
  }
  const github = githubCoordinates(target);
  if (!github) {
    throw new Error(
      "Target is neither an existing directory nor a supported GitHub owner/repository or URL."
    );
  }
  const temporaryRoot = await (0, import_promises2.mkdtemp)((0, import_node_path2.join)((0, import_node_os.tmpdir)(), "repolens-"));
  const checkoutPath = (0, import_node_path2.join)(temporaryRoot, "repository");
  const env = { ...process.env };
  delete env.GIT_TRACE;
  delete env.GIT_TRACE_CURL;
  delete env.GIT_TRACE_PACKET;
  delete env.GIT_CURL_VERBOSE;
  if (githubToken) {
    const basicToken = Buffer.from(`x-access-token:${githubToken}`).toString(
      "base64"
    );
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basicToken}`;
    env.GIT_TERMINAL_PROMPT = "0";
  }
  try {
    await runCommand(
      "git",
      [
        "clone",
        "--depth=100",
        "--no-tags",
        "--filter=blob:limit=25m",
        `${github.url}.git`,
        checkoutPath
      ],
      { env, timeoutMs: 9e4 }
    );
  } catch (error) {
    await (0, import_promises2.rm)(temporaryRoot, { recursive: true, force: true });
    throw error;
  } finally {
    delete env.GIT_CONFIG_VALUE_0;
  }
  return {
    identity: {
      input: `${github.owner}/${github.repo}`,
      kind: "github",
      name: github.repo,
      localPath: checkoutPath,
      github
    },
    cleanup: async () => {
      await (0, import_promises2.rm)(temporaryRoot, { recursive: true, force: true });
    }
  };
}
async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await (0, import_promises2.readdir)(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = (0, import_node_path2.join)(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(normalizePath((0, import_node_path2.relative)(root, absolute)));
      }
    }
  }
  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}
async function trackedFiles(root) {
  const topLevel = await runCommand("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    allowFailure: true
  });
  if (!topLevel) {
    return { files: await walkFiles(root), isGit: false };
  }
  const result = await runCommand("git", ["ls-files", "-z"], {
    cwd: root,
    allowFailure: true
  });
  if (!result) {
    return { files: await walkFiles(root), isGit: false };
  }
  const files = result.stdout.split("\0").filter(Boolean).map(normalizePath).sort((a, b) => a.localeCompare(b));
  const repositoryRoot = (0, import_node_path2.resolve)(topLevel.stdout.trim());
  if (files.length === 0 && repositoryRoot !== (0, import_node_path2.resolve)(root)) {
    return { files: await walkFiles(root), isGit: false };
  }
  return { files, isGit: true };
}
function isReadme(path2) {
  return /^readme(?:\.[^/]+)?$/i.test(path2);
}
function isLicense(path2) {
  return /^(?:licen[cs]e|copying)(?:\.[^/]+)?$/i.test(path2);
}
function isWorkflow(path2) {
  return /^\.github\/workflows\/[^/]+\.(?:ya?ml)$/i.test(path2);
}
function isSecurityFile(path2) {
  return /^(?:\.github\/)?security(?:\.[^/]+)?$/i.test(path2);
}
function isContributingFile(path2) {
  return /^(?:\.github\/)?contributing(?:\.[^/]+)?$/i.test(path2);
}
function isDependencyUpdateFile(path2) {
  return /^\.github\/dependabot\.ya?ml$/i.test(path2) || /^(?:renovate\.json5?|\.renovaterc(?:\.json5?)?)$/i.test(path2);
}
function isTrackedEnvRisk(path2) {
  const name = (0, import_node_path2.basename)(path2).toLowerCase();
  if (SAFE_ENV_EXAMPLES.has(name)) return false;
  return name === ".env" || name.startsWith(".env.");
}
function shouldScanText(path2) {
  const directorySegments = normalizePath(path2).split("/").slice(0, -1);
  if (directorySegments.some(
    (segment) => IGNORED_DIRECTORIES.has(segment) || segment === "fixtures" || segment === "__fixtures__" || segment === "testdata"
  )) {
    return false;
  }
  const name = (0, import_node_path2.basename)(path2).toLowerCase();
  if (name.endsWith(".min.js") || name.endsWith(".min.css") || name.endsWith(".map") || LOCKFILE_NAMES.has((0, import_node_path2.basename)(path2))) {
    return false;
  }
  return TEXT_EXTENSIONS.has((0, import_node_path2.extname)(name));
}
function isActionMarker(line, markerIndex, marker) {
  const prefix = line.slice(0, markerIndex);
  const suffix = line.slice(markerIndex + marker.length);
  const commentPrefix = /(?:\/\/+|#|\/\*+|\*+|<!--|--)\s*$/.test(prefix);
  const explicitMarker = /^\s*(?::|\(|\[|\{)/.test(suffix);
  return commentPrefix || explicitMarker;
}
async function scanTodos(root, files, maxMatches) {
  const matches = [];
  let total = 0;
  let filesScanned = 0;
  for (const path2 of files) {
    if (!shouldScanText(path2) || isTrackedEnvRisk(path2)) continue;
    const absolute = (0, import_node_path2.join)(root, path2);
    const fileStat = await (0, import_promises2.lstat)(absolute).catch(() => null);
    if (!fileStat?.isFile() || fileStat.isSymbolicLink() || fileStat.size > 1024 * 1024) {
      continue;
    }
    const content = await (0, import_promises2.readFile)(absolute, "utf8").catch(() => null);
    if (content === null || content.includes("\0")) continue;
    filesScanned += 1;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const expression = /\b(TODO|FIXME)\b/gi;
      let match2;
      while ((match2 = expression.exec(line)) !== null) {
        if (matches.length < maxMatches) {
          const marker = match2[1]?.toUpperCase();
          if ((marker === "TODO" || marker === "FIXME") && isActionMarker(line, match2.index, marker)) {
            total += 1;
            matches.push({
              path: path2,
              line: index + 1,
              marker,
              text: line.trim().replace(/\s+/g, " ").slice(0, 180)
            });
          }
        } else {
          const marker = match2[1]?.toUpperCase();
          if ((marker === "TODO" || marker === "FIXME") && isActionMarker(line, match2.index, marker)) {
            total += 1;
          }
        }
      }
    }
  }
  return { matches, total, filesScanned };
}
async function unpinnedActions(root, workflowFiles) {
  const results = [];
  for (const path2 of workflowFiles) {
    const content = await (0, import_promises2.readFile)((0, import_node_path2.join)(root, path2), "utf8").catch(() => null);
    if (!content) continue;
    for (const line of content.split(/\r?\n/)) {
      const match2 = /^\s*(?:-\s*)?uses:\s*["']?([^"'#\s]+)["']?/i.exec(line);
      const reference = match2?.[1];
      if (!reference || reference.startsWith("./") || reference.startsWith("docker://")) {
        continue;
      }
      const separator = reference.lastIndexOf("@");
      const revision = separator >= 0 ? reference.slice(separator + 1) : "";
      if (!/^[a-f0-9]{40}$/i.test(revision)) {
        results.push({ path: path2, reference });
      }
    }
  }
  return results;
}
async function packageInventory(root, files) {
  if (!files.includes("package.json")) return null;
  const packagePath = (0, import_node_path2.join)(root, "package.json");
  const packageStat = await (0, import_promises2.lstat)(packagePath).catch(() => null);
  if (!packageStat?.isFile() || packageStat.isSymbolicLink()) return null;
  const raw = await (0, import_promises2.readFile)(packagePath, "utf8").catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const scripts = parsed.scripts && typeof parsed.scripts === "object" && !Array.isArray(parsed.scripts) ? Object.fromEntries(
      Object.entries(parsed.scripts).filter(
        (entry) => typeof entry[1] === "string"
      )
    ) : {};
    let dependencyCount = 0;
    for (const group of [
      parsed.dependencies,
      parsed.devDependencies,
      parsed.optionalDependencies
    ]) {
      if (group && typeof group === "object" && !Array.isArray(group)) {
        dependencyCount += Object.keys(group).length;
      }
    }
    return { path: "package.json", scripts, dependencyCount };
  } catch {
    return { path: "package.json", scripts: {}, dependencyCount: 0 };
  }
}
async function latestCommit(root, now) {
  const result = await runCommand(
    "git",
    ["log", "-1", "--format=%H%x00%s%x00%cI"],
    { cwd: root, allowFailure: true }
  );
  if (!result) return null;
  const [sha, subject, committedAt] = result.stdout.trim().split("\0");
  if (!sha || !subject || !committedAt) return null;
  const timestamp = Date.parse(committedAt);
  if (!Number.isFinite(timestamp)) return null;
  return {
    sha,
    subject,
    committedAt,
    ageDays: Math.max(
      0,
      Math.floor((now.getTime() - timestamp) / (24 * 60 * 60 * 1e3))
    )
  };
}
async function localDefaultBranch(root) {
  const remote = await runCommand(
    "git",
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    { cwd: root, allowFailure: true }
  );
  if (remote?.stdout.trim()) {
    return remote.stdout.trim().replace(/^origin\//, "");
  }
  const current = await runCommand("git", ["branch", "--show-current"], {
    cwd: root,
    allowFailure: true
  });
  return current?.stdout.trim() || null;
}
async function fetchJson(url, token, signal) {
  const timeout = AbortSignal.timeout(8e3);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoLens/0.2.0",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetch(url, { headers, signal: combinedSignal });
    if (!response.ok) return { status: response.status, value: null };
    return { status: response.status, value: await response.json() };
  } catch {
    return { status: 0, value: null };
  }
}
function unavailableReason(label, status) {
  if (status === 0) return `${label}: network request failed or timed out`;
  if (status === 401) return `${label}: GitHub authentication failed`;
  if (status === 403 || status === 429) {
    return `${label}: GitHub permission or rate limit prevented inspection`;
  }
  return `${label}: GitHub API returned HTTP ${status}`;
}
async function githubMetadata(github, token, signal) {
  const apiRoot = `https://api.github.com/repos/${encodeURIComponent(github.owner)}/${encodeURIComponent(github.repo)}`;
  const issueQuery = encodeURIComponent(
    `repo:${github.owner}/${github.repo} is:issue is:open`
  );
  const pullQuery = encodeURIComponent(
    `repo:${github.owner}/${github.repo} is:pr is:open`
  );
  const repository = await fetchJson(
    apiRoot,
    token,
    signal
  );
  const defaultBranch = repository.value?.default_branch ?? null;
  const branchProtectionUrl = defaultBranch ? `${apiRoot}/branches/${encodeURIComponent(defaultBranch)}/protection` : null;
  const [release, issues, pulls, branchProtection, rulesets] = await Promise.all([
    fetchJson(`${apiRoot}/releases/latest`, token, signal),
    fetchJson(
      `https://api.github.com/search/issues?q=${issueQuery}&per_page=1`,
      token,
      signal
    ),
    fetchJson(
      `https://api.github.com/search/issues?q=${pullQuery}&per_page=1`,
      token,
      signal
    ),
    branchProtectionUrl ? fetchJson(
      branchProtectionUrl,
      token,
      signal
    ) : Promise.resolve({ status: 0, value: null }),
    fetchJson(
      `${apiRoot}/rulesets?includes_parents=true`,
      token,
      signal
    )
  ]);
  const releaseValue = release.value;
  const normalizedRelease = releaseValue?.tag_name && releaseValue.published_at && releaseValue.html_url ? {
    tag: releaseValue.tag_name,
    name: releaseValue.name || releaseValue.tag_name,
    publishedAt: releaseValue.published_at,
    url: releaseValue.html_url
  } : null;
  const available = [];
  const unavailable = [];
  const unknownReasons = [];
  if (repository.value) available.push("repository");
  else {
    unavailable.push("repository");
    unknownReasons.push(
      unavailableReason("repository metadata", repository.status)
    );
  }
  if (release.value || release.status === 404) available.push("latest release");
  else {
    unavailable.push("latest release");
    unknownReasons.push(
      unavailableReason("latest release metadata", release.status)
    );
  }
  if (typeof issues.value?.total_count === "number") {
    available.push("open issues");
  } else {
    unavailable.push("open issues");
    unknownReasons.push(unavailableReason("open issue count", issues.status));
  }
  if (typeof pulls.value?.total_count === "number") {
    available.push("open pull requests");
  } else {
    unavailable.push("open pull requests");
    unknownReasons.push(
      unavailableReason("open pull request count", pulls.status)
    );
  }
  let branchProtected = null;
  const rulesetProtectsDefault = Array.isArray(rulesets.value) && rulesets.value.some((ruleset) => {
    if (ruleset.target !== "branch" || !ruleset.enforcement || ruleset.enforcement === "disabled") {
      return false;
    }
    const includes = ruleset.conditions?.ref_name?.include ?? [];
    return includes.some(
      (item) => item === "~ALL" || item === "~DEFAULT_BRANCH" || item === `refs/heads/${defaultBranch ?? ""}`
    );
  });
  if (branchProtection.status === 200 || rulesetProtectsDefault) {
    branchProtected = true;
    available.push("branch protection");
  } else if (branchProtection.status === 404 && repository.value && Array.isArray(rulesets.value)) {
    branchProtected = false;
    available.push("branch protection");
  } else if (branchProtectionUrl) {
    unavailable.push("branch protection");
    unknownReasons.push(
      branchProtection.status !== 404 ? unavailableReason("classic branch protection", branchProtection.status) : unavailableReason("repository rulesets", rulesets.status)
    );
  }
  const dependabotStatus = repository.value?.security_and_analysis?.dependabot_security_updates?.status;
  const dependabotSecurityUpdates = dependabotStatus === "enabled" ? true : dependabotStatus === "disabled" ? false : null;
  if (dependabotSecurityUpdates === null) {
    unavailable.push("Dependabot security updates");
    if (repository.value) {
      unknownReasons.push(
        "Dependabot security update setting: insufficient repository metadata permission"
      );
    }
  } else {
    available.push("Dependabot security updates");
  }
  return {
    defaultBranch,
    branchProtected,
    dependabotSecurityUpdates,
    release: normalizedRelease,
    issues: typeof issues.value?.total_count === "number" ? issues.value.total_count : null,
    pullRequests: typeof pulls.value?.total_count === "number" ? pulls.value.total_count : null,
    available,
    unavailable,
    unknownReasons
  };
}
async function npmDependencies(root) {
  const packagePath = (0, import_node_path2.join)(root, "package.json");
  const packageStat = await (0, import_promises2.lstat)(packagePath).catch(() => null);
  if (!packageStat?.isFile() || packageStat.isSymbolicLink()) return [];
  const raw = await (0, import_promises2.readFile)(packagePath, "utf8").catch(() => null);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const result = [];
    for (const scope of [
      "dependencies",
      "devDependencies",
      "optionalDependencies"
    ]) {
      const group = parsed[scope];
      if (!group || typeof group !== "object" || Array.isArray(group)) continue;
      for (const [name, declared] of Object.entries(group)) {
        if (typeof declared === "string") result.push({ name, declared, scope });
      }
    }
    return result;
  } catch {
    return [];
  }
}
function supportsRegistryCheck(range2) {
  return !/^(?:file:|git\+|github:|https?:|workspace:|link:|npm:)/i.test(range2) && import_semver.default.validRange(range2) !== null;
}
async function outdatedDependencies(root, options) {
  const dependencies = await npmDependencies(root);
  if (dependencies.length === 0) {
    return {
      outdated: [],
      attempted: false,
      eligible: 0,
      checked: 0,
      status: "not-applicable",
      skippedReason: "No npm dependencies were found."
    };
  }
  if (options.offline) {
    return {
      outdated: [],
      attempted: false,
      eligible: dependencies.filter(
        (dependency) => supportsRegistryCheck(dependency.declared)
      ).length,
      checked: 0,
      status: "offline",
      skippedReason: "Offline mode was requested."
    };
  }
  const supported = dependencies.filter(
    (dependency) => supportsRegistryCheck(dependency.declared)
  );
  if (supported.length === 0) {
    return {
      outdated: [],
      attempted: false,
      eligible: 0,
      checked: 0,
      status: "not-applicable",
      skippedReason: "No supported npm semver ranges were found."
    };
  }
  const candidates = supported.slice(0, 100);
  const outdated = [];
  let checked = 0;
  for (let index = 0; index < candidates.length; index += 8) {
    const batch = candidates.slice(index, index + 8);
    await Promise.all(
      batch.map(async (dependency) => {
        const timeout = AbortSignal.timeout(5e3);
        try {
          const response = await fetch(
            `https://registry.npmjs.org/${encodeURIComponent(dependency.name)}/latest`,
            {
              headers: { "User-Agent": "RepoLens/0.2.0" },
              signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
            }
          );
          if (!response.ok) return;
          const payload = await response.json();
          if (typeof payload.version !== "string") return;
          checked += 1;
          if (!import_semver.default.satisfies(payload.version, dependency.declared)) {
            outdated.push({
              ...dependency,
              latest: payload.version
            });
          }
        } catch {
        }
      })
    );
  }
  outdated.sort((a, b) => a.name.localeCompare(b.name));
  const complete = checked === supported.length && supported.length <= 100;
  const status = checked === 0 ? "unavailable" : complete ? "complete" : "partial";
  return {
    outdated,
    attempted: true,
    eligible: supported.length,
    checked,
    status,
    skippedReason: supported.length > 100 ? "Only the first 100 supported npm dependencies were checked." : status === "unavailable" ? "The npm registry was unavailable." : status === "partial" ? `${checked} of ${supported.length} eligible npm dependencies were checked.` : null
  };
}
async function scanRepository(identity, options) {
  const root = identity.localPath;
  const { files: rawFiles, isGit } = await trackedFiles(root);
  const excludes = options.excludes ?? [];
  const excludedFiles = rawFiles.filter(
    (path2) => isExcludedPath(path2, excludes)
  );
  const files = rawFiles.filter((path2) => !isExcludedPath(path2, excludes));
  const workflowFiles = files.filter(isWorkflow);
  const [
    todos,
    packageJson,
    commit,
    branch,
    dependencyState,
    actionReferences
  ] = await Promise.all([
    scanTodos(root, files, options.maxTodoMatches),
    packageInventory(root, files),
    isGit ? latestCommit(root, options.now) : Promise.resolve(null),
    isGit ? localDefaultBranch(root) : Promise.resolve(null),
    outdatedDependencies(root, options),
    unpinnedActions(root, workflowFiles)
  ]);
  const largeFiles = [];
  for (const path2 of files) {
    const fileStat = await (0, import_promises2.lstat)((0, import_node_path2.join)(root, path2)).catch(() => null);
    if (fileStat?.isFile() && !fileStat.isSymbolicLink() && fileStat.size >= options.largeFileBytes) {
      largeFiles.push({ path: path2, bytes: fileStat.size });
    }
  }
  largeFiles.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  let metadata = {
    defaultBranch: branch,
    branchProtected: null,
    dependabotSecurityUpdates: null,
    release: null,
    issues: null,
    pullRequests: null,
    available: [],
    unavailable: [],
    unknownReasons: []
  };
  if (identity.github && !options.offline) {
    metadata = await githubMetadata(
      identity.github,
      options.githubToken,
      options.signal
    );
    metadata.defaultBranch ||= branch;
  }
  const unknownReasons = [...metadata.unknownReasons];
  if (dependencyState.status === "unavailable" || dependencyState.status === "partial") {
    unknownReasons.push(
      `npm dependency metadata: ${dependencyState.skippedReason ?? "inspection was incomplete"}`
    );
  }
  const githubStatus = !identity.github ? "not-applicable" : options.offline ? "offline" : metadata.unavailable.length === 0 ? "complete" : "partial";
  return {
    isGitRepository: isGit,
    trackedFiles: files,
    readmeFiles: files.filter(isReadme),
    licenseFiles: files.filter(isLicense),
    workflowFiles,
    lockfiles: files.filter((path2) => LOCKFILE_NAMES.has((0, import_node_path2.basename)(path2))),
    packageJson,
    todoMatches: todos.matches,
    todoTotal: todos.total,
    largeFiles,
    trackedEnvFiles: isGit ? files.filter(isTrackedEnvRisk) : [],
    securityFiles: files.filter(isSecurityFile),
    contributingFiles: files.filter(isContributingFile),
    dependencyUpdateFiles: files.filter(isDependencyUpdateFile),
    unpinnedActions: actionReferences,
    latestCommit: commit,
    defaultBranch: metadata.defaultBranch,
    branchProtected: metadata.branchProtected,
    dependabotSecurityUpdates: metadata.dependabotSecurityUpdates,
    latestRelease: metadata.release,
    openIssues: metadata.issues,
    openPullRequests: metadata.pullRequests,
    outdatedDependencies: dependencyState.outdated,
    dependencyCheck: {
      attempted: dependencyState.attempted,
      eligible: dependencyState.eligible,
      checked: dependencyState.checked,
      status: dependencyState.status,
      skippedReason: dependencyState.skippedReason
    },
    coverage: {
      trackedFiles: rawFiles.length,
      includedFiles: files.length,
      excludedFiles: excludedFiles.length,
      excludes: [...excludes],
      todoTextFiles: todos.filesScanned,
      dependencyPackages: {
        eligible: dependencyState.eligible,
        checked: dependencyState.checked,
        status: dependencyState.status
      },
      github: {
        status: githubStatus,
        available: metadata.available,
        unavailable: metadata.unavailable
      },
      unknownReasons
    }
  };
}

// src/audit.ts
function evidence(entries) {
  return entries.map(([label, value]) => ({ label, value }));
}
function comparisonEvidence(keys, count = keys.length, complete = count === keys.length) {
  if (!complete) return { count, digest: null };
  const hash = (0, import_node_crypto.createHash)("sha256");
  for (const key of [...keys].sort()) {
    hash.update(`${Buffer.byteLength(key, "utf8")}:`);
    hash.update(key);
  }
  return { count, digest: hash.digest("hex") };
}
function finding(id, title, severity, summary, action, deduction, details = [], comparisonBasis) {
  const result = {
    id,
    title,
    severity,
    summary,
    action,
    deduction,
    evidence: details
  };
  if (comparisonBasis) result.comparisonEvidence = comparisonBasis;
  return result;
}
function documentationFindings(inventory) {
  return [
    inventory.readmeFiles.length > 0 ? finding(
      "readme",
      "README",
      "pass",
      "A root README is present.",
      null,
      0,
      evidence([["files", inventory.readmeFiles.join(", ")]])
    ) : finding(
      "readme",
      "README",
      "warning",
      "No root README was found.",
      "Add a README with purpose, setup, usage, maintenance status, and support boundaries.",
      10
    ),
    inventory.licenseFiles.length > 0 ? finding(
      "license",
      "License",
      "pass",
      "A root license file is present.",
      null,
      0,
      evidence([["files", inventory.licenseFiles.join(", ")]])
    ) : finding(
      "license",
      "License",
      "warning",
      "No root LICENSE or COPYING file was found.",
      "Choose an explicit license and add its full text at the repository root.",
      10
    ),
    inventory.securityFiles.length > 0 ? finding(
      "security-policy",
      "Security policy",
      "pass",
      "A security policy is present.",
      null,
      0,
      evidence([["files", inventory.securityFiles.join(", ")]])
    ) : finding(
      "security-policy",
      "Security policy",
      "warning",
      "No SECURITY document was found.",
      "Add SECURITY.md with supported versions and a private vulnerability reporting path.",
      5
    ),
    inventory.contributingFiles.length > 0 ? finding(
      "contributing-guide",
      "Contributing guide",
      "pass",
      "A contribution guide is present.",
      null,
      0,
      evidence([["files", inventory.contributingFiles.join(", ")]])
    ) : finding(
      "contributing-guide",
      "Contributing guide",
      "info",
      "No CONTRIBUTING document was found.",
      "Add CONTRIBUTING.md when outside contributions or repeatable maintainer setup matter.",
      0
    )
  ];
}
function automationFindings(inventory) {
  const results = [];
  results.push(
    inventory.workflowFiles.length > 0 ? finding(
      "ci",
      "CI configuration",
      "pass",
      `${inventory.workflowFiles.length} GitHub Actions workflow file(s) found. File presence does not prove that a run passed.`,
      null,
      0,
      evidence([["files", inventory.workflowFiles.join(", ")]])
    ) : finding(
      "ci",
      "CI configuration",
      "warning",
      "No GitHub Actions workflow was found.",
      "Add a pull-request workflow that installs from the lockfile and runs tests, lint, and build.",
      8
    )
  );
  results.push(
    inventory.workflowFiles.length === 0 ? finding(
      "action-pinning",
      "Immutable action references",
      "info",
      "No GitHub Actions workflows were available to inspect.",
      null,
      0
    ) : inventory.unpinnedActions.length === 0 ? finding(
      "action-pinning",
      "Immutable action references",
      "pass",
      "External GitHub Actions references are pinned to full commit SHAs.",
      null,
      0
    ) : finding(
      "action-pinning",
      "Immutable action references",
      "warning",
      `${inventory.unpinnedActions.length} external action reference(s) use a mutable tag or branch.`,
      "Pin each external action to a verified full commit SHA and keep a version comment beside it.",
      Math.min(8, inventory.unpinnedActions.length * 2),
      inventory.unpinnedActions.slice(0, 12).map((item) => ({
        label: item.path,
        value: item.reference
      })),
      comparisonEvidence(
        inventory.unpinnedActions.map((item) => {
          const separator = item.reference.lastIndexOf("@");
          const action = separator > 0 ? item.reference.slice(0, separator) : item.reference;
          return `${item.path}\0${action.toLowerCase()}`;
        })
      )
    )
  );
  const dependencyProject = (inventory.packageJson?.dependencyCount ?? 0) > 0 || inventory.lockfiles.length > 0;
  results.push(
    !dependencyProject ? finding(
      "dependency-updates",
      "Dependency update automation",
      "info",
      "No dependency project was detected.",
      null,
      0
    ) : inventory.dependencyUpdateFiles.length === 0 ? finding(
      "dependency-updates",
      "Dependency update automation",
      "warning",
      "No Dependabot or Renovate configuration was found.",
      "Configure one dependency update service with a bounded weekly schedule; do not run overlapping bots.",
      6
    ) : inventory.dependabotSecurityUpdates === false ? finding(
      "dependency-updates",
      "Dependency update automation",
      "warning",
      "A dependency update configuration exists, but GitHub reports Dependabot security updates disabled.",
      "Enable Dependabot alerts and security updates, or document the alternative security update process.",
      4,
      evidence([
        ["files", inventory.dependencyUpdateFiles.join(", ")]
      ])
    ) : finding(
      "dependency-updates",
      "Dependency update automation",
      "pass",
      `Dependency update configuration found: ${inventory.dependencyUpdateFiles.join(", ")}.`,
      null,
      0
    )
  );
  results.push(
    inventory.branchProtected === true ? finding(
      "branch-protection",
      "Default branch protection",
      "pass",
      "GitHub reports protection for the default branch.",
      null,
      0
    ) : inventory.branchProtected === false ? finding(
      "branch-protection",
      "Default branch protection",
      "warning",
      "The default branch is not protected by classic branch protection or an active matching ruleset.",
      "Add a repository ruleset or branch protection that blocks force pushes and requires the relevant checks.",
      10
    ) : finding(
      "branch-protection",
      "Default branch protection",
      inventory.coverage.github.status === "partial" ? "unknown" : "info",
      inventory.coverage.github.status === "partial" ? "Branch protection could not be verified with the available GitHub permission or API quota." : "Branch protection was not checked for this local or offline audit.",
      inventory.coverage.github.status === "partial" ? "Run with a token that can read repository rules, or review the setting in GitHub." : null,
      0
    )
  );
  results.push(
    inventory.lockfiles.length > 0 ? finding(
      "lockfile",
      "Dependency lockfile",
      "pass",
      `${inventory.lockfiles.length} dependency lockfile(s) found.`,
      null,
      0,
      evidence([["files", inventory.lockfiles.join(", ")]])
    ) : dependencyProject ? finding(
      "lockfile",
      "Dependency lockfile",
      "warning",
      "Dependencies are declared but no recognized lockfile was found.",
      "Generate and commit the package manager lockfile for reproducible installs.",
      7
    ) : finding(
      "lockfile",
      "Dependency lockfile",
      "info",
      "No dependency manifest requiring a lockfile was detected.",
      null,
      0
    )
  );
  if (!inventory.packageJson) {
    results.push(
      finding(
        "package-scripts",
        "Package scripts",
        "info",
        "No root package.json was found; npm scripts were not applicable.",
        null,
        0
      )
    );
  } else {
    const scripts = Object.keys(inventory.packageJson.scripts);
    const expected = ["test", "build", "lint"];
    const missing = expected.filter((name) => !scripts.includes(name));
    results.push(
      missing.length === 0 ? finding(
        "package-scripts",
        "Package scripts",
        "pass",
        "Root test, build, and lint scripts are present.",
        null,
        0,
        evidence([["scripts", scripts.sort().join(", ")]])
      ) : finding(
        "package-scripts",
        "Package scripts",
        "warning",
        `Root package.json is missing: ${missing.join(", ")}.`,
        `Add working ${missing.join(", ")} script${missing.length === 1 ? "" : "s"} and run them in CI.`,
        Math.min(6, missing.length * 2),
        evidence([["present", scripts.sort().join(", ") || "none"]])
      )
    );
  }
  return results;
}
function hygieneFindings(inventory) {
  const results = [];
  if (inventory.dependencyCheck.status === "unavailable" || inventory.dependencyCheck.status === "partial" && inventory.outdatedDependencies.length === 0) {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "unknown",
        inventory.dependencyCheck.skippedReason ?? "npm dependency metadata was incomplete.",
        "Retry with registry access before treating dependency freshness as clear.",
        0,
        evidence([
          ["eligible", inventory.dependencyCheck.eligible],
          ["checked", inventory.dependencyCheck.checked]
        ])
      )
    );
  } else if (!inventory.dependencyCheck.attempted) {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "info",
        inventory.dependencyCheck.skippedReason ?? "The npm dependency check was not applicable.",
        null,
        0
      )
    );
  } else if (inventory.outdatedDependencies.length === 0) {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "pass",
        `No out-of-range npm updates were found across ${inventory.dependencyCheck.checked} checked package(s).`,
        null,
        0
      )
    );
  } else {
    results.push(
      finding(
        "outdated-dependencies",
        "Outdated npm dependencies",
        "warning",
        `${inventory.outdatedDependencies.length} declared range(s) exclude the latest npm release.`,
        "Review the listed updates individually, run tests, and update the lockfile; do not bulk-upgrade blindly.",
        Math.min(10, inventory.outdatedDependencies.length * 2),
        inventory.outdatedDependencies.slice(0, 15).map((dependency) => ({
          label: dependency.name,
          value: `${dependency.declared} \u2192 ${dependency.latest} (${dependency.scope})`
        })),
        comparisonEvidence(
          inventory.outdatedDependencies.map(
            (dependency) => `${dependency.scope}\0${dependency.name.toLowerCase()}`
          )
        )
      )
    );
  }
  results.push(
    inventory.todoTotal === 0 ? finding(
      "todo-fixme",
      "TODO and FIXME markers",
      "pass",
      "No TODO or FIXME markers were found in scanned text files.",
      null,
      0
    ) : finding(
      "todo-fixme",
      "TODO and FIXME markers",
      inventory.todoTotal > 20 ? "warning" : "info",
      `${inventory.todoTotal} TODO/FIXME marker(s) found.`,
      "Convert actionable markers into tracked issues or resolve them; leave only contextual markers with owners.",
      inventory.todoTotal > 20 ? Math.min(5, Math.ceil(inventory.todoTotal / 10)) : 0,
      inventory.todoMatches.slice(0, 12).map((match2) => ({
        label: `${match2.path}:${match2.line}`,
        value: `${match2.marker} \u2014 ${match2.text}`
      })),
      comparisonEvidence(
        inventory.todoMatches.map(
          (match2) => `${match2.path}\0${match2.marker}\0${match2.text}`
        ),
        inventory.todoTotal
      )
    )
  );
  results.push(
    inventory.largeFiles.length === 0 ? finding(
      "large-files",
      "Large tracked files",
      "pass",
      "No tracked file exceeded the configured size threshold.",
      null,
      0
    ) : finding(
      "large-files",
      "Large tracked files",
      "warning",
      `${inventory.largeFiles.length} tracked file(s) exceeded the configured size threshold.`,
      "Remove generated artifacts, compress appropriate assets, or use Git LFS for files that belong in version control.",
      Math.min(8, inventory.largeFiles.length * 2),
      inventory.largeFiles.slice(0, 12).map((file) => ({
        label: file.path,
        value: `${(file.bytes / (1024 * 1024)).toFixed(2)} MiB`
      })),
      comparisonEvidence(
        inventory.largeFiles.map((file) => file.path)
      )
    )
  );
  results.push(
    !inventory.isGitRepository ? finding(
      "tracked-env",
      "Tracked environment files",
      "info",
      "The target is not a Git work tree, so tracked .env risk is not applicable.",
      "Review environment files before initializing version control and commit only value-free examples.",
      0
    ) : inventory.trackedEnvFiles.length === 0 ? finding(
      "tracked-env",
      "Tracked environment files",
      "pass",
      "No tracked .env file pattern was found.",
      null,
      0
    ) : finding(
      "tracked-env",
      "Tracked environment files",
      "critical",
      `${inventory.trackedEnvFiles.length} tracked environment file(s) may expose credentials.`,
      "Remove tracked environment files from history after rotating any exposed credentials; commit a value-free .env.example instead.",
      20,
      inventory.trackedEnvFiles.map((path2) => ({
        label: "path",
        value: path2
      })),
      comparisonEvidence(inventory.trackedEnvFiles)
    )
  );
  return results;
}
function activityFindings(inventory, identity, staleDays) {
  const results = [];
  if (!inventory.latestCommit && !inventory.isGitRepository) {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "info",
        "The target is not a Git work tree, so commit activity is unavailable.",
        "Initialize version control when this directory becomes a maintained repository.",
        0
      )
    );
  } else if (!inventory.latestCommit) {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "warning",
        "No Git commit could be read.",
        "Initialize version control or make repository history available to the audit.",
        8
      )
    );
  } else if (inventory.latestCommit.ageDays > staleDays) {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "warning",
        `The latest commit is ${inventory.latestCommit.ageDays} days old.`,
        "Confirm whether the project is maintained, archived, or needs a documented maintenance handoff.",
        6,
        evidence([
          ["commit", inventory.latestCommit.sha.slice(0, 12)],
          ["date", inventory.latestCommit.committedAt],
          ["subject", inventory.latestCommit.subject]
        ])
      )
    );
  } else {
    results.push(
      finding(
        "recent-commit",
        "Recent commit",
        "pass",
        `The latest commit is ${inventory.latestCommit.ageDays} day(s) old.`,
        null,
        0,
        evidence([
          ["commit", inventory.latestCommit.sha.slice(0, 12)],
          ["date", inventory.latestCommit.committedAt],
          ["subject", inventory.latestCommit.subject]
        ])
      )
    );
  }
  results.push(
    inventory.defaultBranch ? finding(
      "default-branch",
      "Default branch",
      "pass",
      `Default branch: ${inventory.defaultBranch}.`,
      null,
      0,
      evidence([["branch", inventory.defaultBranch]])
    ) : finding(
      "default-branch",
      "Default branch",
      inventory.isGitRepository ? "warning" : "info",
      inventory.isGitRepository ? "The default branch could not be determined." : "The target is not a Git work tree, so no default branch exists.",
      inventory.isGitRepository ? "Configure origin/HEAD or make GitHub repository metadata available." : null,
      inventory.isGitRepository ? 3 : 0
    )
  );
  if (!identity.github) {
    results.push(
      finding(
        "latest-release",
        "Latest release",
        "info",
        "No GitHub origin was detected, so release metadata was unavailable.",
        null,
        0
      )
    );
  } else if (inventory.latestRelease) {
    results.push(
      finding(
        "latest-release",
        "Latest release",
        "pass",
        `Latest release: ${inventory.latestRelease.tag}.`,
        null,
        0,
        evidence([
          ["published", inventory.latestRelease.publishedAt],
          ["url", inventory.latestRelease.url]
        ])
      )
    );
  } else {
    const releaseUnavailable = inventory.coverage.github.unavailable.includes("latest release");
    results.push(
      finding(
        "latest-release",
        "Latest release",
        releaseUnavailable ? "unknown" : "info",
        releaseUnavailable ? "Latest release metadata could not be read." : "No published GitHub release was found.",
        releaseUnavailable ? "Retry with GitHub API access before deciding that no release exists." : "Publish signed or checksummed releases when consumers need stable downloadable artifacts.",
        0
      )
    );
  }
  const issuesUnavailable = inventory.coverage.github.unavailable.includes("open issues");
  const pullsUnavailable = inventory.coverage.github.unavailable.includes("open pull requests");
  results.push(
    finding(
      "open-issues",
      "Open issues",
      issuesUnavailable ? "unknown" : "info",
      inventory.openIssues === null ? issuesUnavailable ? "Open issue count could not be read." : "Open issue count was not checked." : `${inventory.openIssues} open issue(s).`,
      null,
      0,
      evidence([["count", inventory.openIssues]])
    ),
    finding(
      "open-pull-requests",
      "Open pull requests",
      pullsUnavailable ? "unknown" : "info",
      inventory.openPullRequests === null ? pullsUnavailable ? "Open pull request count could not be read." : "Open pull request count was not checked." : `${inventory.openPullRequests} open pull request(s).`,
      null,
      0,
      evidence([["count", inventory.openPullRequests]])
    )
  );
  return results;
}
function coverageFinding(inventory) {
  const details = [
    {
      label: "files",
      value: `${inventory.coverage.includedFiles} included / ${inventory.coverage.excludedFiles} excluded / ${inventory.coverage.trackedFiles} discovered`
    },
    {
      label: "TODO text files",
      value: inventory.coverage.todoTextFiles
    },
    {
      label: "npm metadata",
      value: `${inventory.coverage.dependencyPackages.checked}/${inventory.coverage.dependencyPackages.eligible} (${inventory.coverage.dependencyPackages.status})`
    },
    {
      label: "GitHub metadata",
      value: inventory.coverage.github.status
    }
  ];
  if (inventory.coverage.excludes.length > 0) {
    details.push({
      label: "exclude globs",
      value: inventory.coverage.excludes.join(", ")
    });
  }
  for (const reason of inventory.coverage.unknownReasons.slice(0, 8)) {
    details.push({ label: "unknown", value: reason });
  }
  return inventory.coverage.unknownReasons.length > 0 ? finding(
    "scan-coverage",
    "Detection scope",
    "unknown",
    `${inventory.coverage.unknownReasons.length} external metadata area(s) could not be verified. Unknown does not mean pass.`,
    "Retry with network and the least GitHub permission needed for the missing metadata, or use non-strict mode when the omission is intentional.",
    0,
    details,
    comparisonEvidence(inventory.coverage.unknownReasons)
  ) : finding(
    "scan-coverage",
    "Detection scope",
    "info",
    `${inventory.coverage.includedFiles} file(s) were included and ${inventory.coverage.excludedFiles} excluded by configuration.`,
    null,
    0,
    details
  );
}
function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
function createAuditReport(identity, inventory, options) {
  const findings = [
    ...documentationFindings(inventory),
    ...automationFindings(inventory),
    ...hygieneFindings(inventory),
    ...activityFindings(inventory, identity, options.staleDays),
    coverageFinding(inventory)
  ];
  const score = Math.max(
    0,
    100 - findings.reduce((sum, item) => sum + item.deduction, 0)
  );
  const severityOrder = {
    critical: 0,
    warning: 1,
    unknown: 2,
    info: 3,
    pass: 4
  };
  const actions = findings.filter(
    (item) => item.action !== null
  ).sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.deduction - a.deduction || a.title.localeCompare(b.title)
  ).map((item, index) => ({
    priority: index + 1,
    check: item.id,
    action: item.action,
    reason: item.summary
  }));
  const counts = {
    pass: findings.filter((item) => item.severity === "pass").length,
    info: findings.filter((item) => item.severity === "info").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    critical: findings.filter((item) => item.severity === "critical").length,
    unknown: findings.filter((item) => item.severity === "unknown").length
  };
  const { localPath: _localPath, ...repository } = identity;
  void _localPath;
  return {
    schemaVersion: 2,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    generatedAt: options.now.toISOString(),
    repository,
    score,
    grade: grade(score),
    counts,
    comparison: {
      baseline: null,
      new: { critical: 0, warning: 0, unknown: 0 },
      resolved: { critical: 0, warning: 0, unknown: 0 },
      changes: []
    },
    policy: {
      failOn: "none",
      strict: false,
      passed: true,
      operationalError: false,
      reasons: []
    },
    coverage: inventory.coverage,
    findings,
    actions,
    limitations: [
      "RepoLens is a maintenance heuristic, not a vulnerability scanner, license opinion, or proof that tests pass.",
      "A configured workflow file is evidence of automation intent, not evidence that its latest run passed.",
      "TODO/FIXME scanning skips common generated directories, lockfiles, minified files, files over 1 MiB, and tracked .env contents.",
      "Tracked environment risk is reported from filenames only; RepoLens does not print environment-file values.",
      inventory.dependencyCheck.attempted ? "Outdated dependency checks compare supported root npm ranges with the registry latest tag; they do not resolve compatibility." : `Outdated npm dependency check skipped: ${inventory.dependencyCheck.skippedReason ?? "not applicable"}`,
      identity.kind === "github" ? "Remote audits use a temporary shallow clone and remove it after reporting." : "Local audits do not modify files, install dependencies, or run repository scripts.",
      identity.github ? "GitHub settings and counts are point-in-time API results; unavailable fields remain unknown rather than passing." : "GitHub release, issue, and pull-request metadata require a recognizable GitHub origin."
    ]
  };
}
async function auditTarget(target, options) {
  const prepared = await prepareRepository(target, options.githubToken);
  try {
    const inventory = await scanRepository(prepared.identity, options);
    return createAuditReport(prepared.identity, inventory, options);
  } finally {
    await prepared.cleanup();
  }
}

// src/comparison.ts
var import_promises3 = require("node:fs/promises");
var import_node_path3 = require("node:path");
var ACTIONABLE = /* @__PURE__ */ new Set(["critical", "warning", "unknown"]);
var AGGREGATE_CHECKS = /* @__PURE__ */ new Set([
  "action-pinning",
  "outdated-dependencies",
  "todo-fixme",
  "large-files",
  "tracked-env",
  "scan-coverage"
]);
var RANK = {
  pass: 0,
  info: 0,
  warning: 1,
  critical: 2
};
function isSeverity(value) {
  return value === "pass" || value === "info" || value === "warning" || value === "critical" || value === "unknown";
}
function isEvidenceValue(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
function parseOptionalEvidence(value, findingIndex) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value)) {
    throw new Error(
      `Baseline finding ${findingIndex + 1} has invalid evidence.`
    );
  }
  return value.map((item, evidenceIndex) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(
        `Baseline finding ${findingIndex + 1} evidence ${evidenceIndex + 1} is invalid.`
      );
    }
    const evidenceItem = item;
    if (typeof evidenceItem.label !== "string" || !isEvidenceValue(evidenceItem.value)) {
      throw new Error(
        `Baseline finding ${findingIndex + 1} evidence ${evidenceIndex + 1} is incomplete.`
      );
    }
    return {
      label: evidenceItem.label,
      value: evidenceItem.value
    };
  });
}
function parseOptionalComparisonEvidence(value, findingIndex) {
  if (value === void 0) return void 0;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `Baseline finding ${findingIndex + 1} has invalid comparison evidence.`
    );
  }
  const candidate = value;
  if (!Number.isSafeInteger(candidate.count) || candidate.count < 0 || !(candidate.digest === null || typeof candidate.digest === "string" && /^[a-f0-9]{64}$/.test(candidate.digest))) {
    throw new Error(
      `Baseline finding ${findingIndex + 1} has incomplete comparison evidence.`
    );
  }
  return {
    count: candidate.count,
    digest: candidate.digest
  };
}
function parseBaseline(value, source) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Baseline ${source} must be a RepoLens JSON object.`);
  }
  const candidate = value;
  if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) {
    throw new Error(`Baseline ${source} has an unsupported schemaVersion.`);
  }
  if (typeof candidate.generatedAt !== "string") {
    throw new Error(`Baseline ${source} is missing generatedAt.`);
  }
  if (!Array.isArray(candidate.findings)) {
    throw new Error(`Baseline ${source} is missing findings.`);
  }
  const findings = candidate.findings.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error(`Baseline finding ${index + 1} is invalid.`);
    }
    const finding2 = item;
    if (typeof finding2.id !== "string" || typeof finding2.title !== "string" || !isSeverity(finding2.severity)) {
      throw new Error(`Baseline finding ${index + 1} is incomplete.`);
    }
    const parsed = {
      id: finding2.id,
      title: finding2.title,
      severity: finding2.severity
    };
    if (finding2.summary !== void 0) {
      if (typeof finding2.summary !== "string") {
        throw new Error(
          `Baseline finding ${index + 1} has an invalid summary.`
        );
      }
      parsed.summary = finding2.summary;
    }
    if (finding2.deduction !== void 0) {
      if (typeof finding2.deduction !== "number" || !Number.isFinite(finding2.deduction)) {
        throw new Error(
          `Baseline finding ${index + 1} has an invalid deduction.`
        );
      }
      parsed.deduction = finding2.deduction;
    }
    const parsedEvidence = parseOptionalEvidence(finding2.evidence, index);
    if (parsedEvidence !== void 0) parsed.evidence = parsedEvidence;
    const parsedComparisonEvidence = parseOptionalComparisonEvidence(
      finding2.comparisonEvidence,
      index
    );
    if (parsedComparisonEvidence !== void 0) {
      parsed.comparisonEvidence = parsedComparisonEvidence;
    }
    return parsed;
  });
  return {
    generatedAt: candidate.generatedAt,
    findings
  };
}
async function loadBaseline(path2) {
  const source = (0, import_node_path3.resolve)(path2);
  let parsed;
  try {
    parsed = JSON.parse(await (0, import_promises3.readFile)(source, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read baseline ${source}: ${detail}`);
  }
  return { source, report: parseBaseline(parsed, source) };
}
function classifyChange(previous, current) {
  if (previous === current) return null;
  if (previous === null) return "new";
  if (current === null) return "resolved";
  if (current === "unknown") return "worsened";
  if (previous === "unknown") {
    return current === "critical" || current === "warning" ? "worsened" : "resolved";
  }
  if (RANK[current] > RANK[previous]) return "worsened";
  if (RANK[current] < RANK[previous]) {
    return RANK[current] === 0 ? "resolved" : "improved";
  }
  return null;
}
function normalized(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function evidenceIdentity(check, item) {
  const label = normalized(item.label);
  const value = normalized(item.value);
  switch (check) {
    case "action-pinning": {
      const separator = value.lastIndexOf("@");
      const action = separator > 0 ? value.slice(0, separator) : value;
      return `${label}\0${action.toLowerCase()}`;
    }
    case "outdated-dependencies":
      return label;
    case "todo-fixme":
      return `${label.replace(/:\d+$/, "")}\0${value}`;
    case "large-files":
      return label;
    case "tracked-env":
      return value;
    case "scan-coverage":
      return label === "unknown" ? value : null;
    default:
      return null;
  }
}
function identityCounts(finding2) {
  if (!finding2.evidence) return null;
  const counts = /* @__PURE__ */ new Map();
  for (const item of finding2.evidence) {
    const identity = evidenceIdentity(finding2.id, item);
    if (identity === null) continue;
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}
function addedIdentityCount(current, previous) {
  let added = 0;
  for (const [identity, count] of current) {
    added += Math.max(0, count - (previous.get(identity) ?? 0));
  }
  return added;
}
function aggregateCount(finding2) {
  const summaryCount = typeof finding2.summary === "string" ? /^(\d+)\b/.exec(finding2.summary) : null;
  if (summaryCount?.[1]) return Number.parseInt(summaryCount[1], 10);
  const identities = identityCounts(finding2);
  if (!identities) return null;
  return [...identities.values()].reduce((sum, count) => sum + count, 0);
}
function aggregateChange(before, after) {
  if (before.severity !== after.severity || !ACTIONABLE.has(after.severity) || !AGGREGATE_CHECKS.has(after.id)) {
    return null;
  }
  const previousBasis = before.comparisonEvidence;
  const currentBasis = after.comparisonEvidence;
  const previousCount = previousBasis?.count ?? aggregateCount(before);
  const currentCount = currentBasis?.count ?? aggregateCount(after);
  if (previousCount !== null && currentCount !== null && previousCount !== currentCount) {
    return currentCount > previousCount ? {
      kind: "worsened",
      detail: `Total evidence increased from ${previousCount} to ${currentCount}.`
    } : {
      kind: "improved",
      detail: `Total evidence decreased from ${previousCount} to ${currentCount}.`
    };
  }
  if (previousBasis && currentBasis) {
    if (previousBasis.digest !== null && currentBasis.digest !== null && previousBasis.digest !== currentBasis.digest) {
      return {
        kind: "worsened",
        detail: `Evidence changed while the total remained ${currentBasis.count}.`
      };
    }
    return null;
  }
  if (previousCount !== null && currentCount !== null) return null;
  const previousIdentities = identityCounts(before);
  const currentIdentities = identityCounts(after);
  if (!previousIdentities || !currentIdentities) return null;
  const added = addedIdentityCount(
    currentIdentities,
    previousIdentities
  );
  const removed = addedIdentityCount(
    previousIdentities,
    currentIdentities
  );
  if (added > 0) {
    return {
      kind: "worsened",
      detail: removed > 0 ? `${added} new evidence item(s); ${removed} accepted item(s) no longer present.` : `${added} new evidence item(s).`
    };
  }
  if (removed > 0) {
    return {
      kind: "improved",
      detail: `${removed} accepted evidence item(s) no longer present.`
    };
  }
  return null;
}
function emptySeverityCounts() {
  return { critical: 0, warning: 0, unknown: 0 };
}
function compareWithBaseline(report, baseline, source) {
  const previous = new Map(baseline.findings.map((item) => [item.id, item]));
  const current = new Map(report.findings.map((item) => [item.id, item]));
  const ids = /* @__PURE__ */ new Set([...previous.keys(), ...current.keys()]);
  const changes = [];
  const newCounts = emptySeverityCounts();
  const resolvedCounts = emptySeverityCounts();
  for (const id of [...ids].sort()) {
    const before = previous.get(id);
    const after = current.get(id);
    let kind = classifyChange(
      before?.severity ?? null,
      after?.severity ?? null
    );
    let detail;
    if (!kind && before && after) {
      const aggregate = aggregateChange(before, after);
      kind = aggregate?.kind ?? null;
      detail = aggregate?.detail;
    }
    if (!kind) continue;
    const change = {
      check: id,
      title: after?.title ?? before?.title ?? id,
      from: before?.severity ?? null,
      to: after?.severity ?? null,
      kind
    };
    if (detail) change.detail = detail;
    changes.push(change);
    if ((kind === "new" || kind === "worsened") && after && ACTIONABLE.has(after.severity)) {
      if (after.severity === "critical" || after.severity === "warning" || after.severity === "unknown") {
        newCounts[after.severity] += 1;
      }
    }
    if ((kind === "resolved" || kind === "improved") && before && ACTIONABLE.has(before.severity)) {
      if (before.severity === "critical" || before.severity === "warning" || before.severity === "unknown") {
        resolvedCounts[before.severity] += 1;
      }
    }
  }
  const comparison = {
    baseline: {
      source,
      generatedAt: baseline.generatedAt
    },
    new: newCounts,
    resolved: resolvedCounts,
    changes
  };
  return { ...report, comparison };
}

// src/policy.ts
function evaluatePolicy(report, failOn, strict) {
  const hasBaseline = report.comparison.baseline !== null;
  const currentCritical = report.counts.critical;
  const currentWarning = report.counts.warning;
  const newCritical = hasBaseline ? report.comparison.new.critical : currentCritical;
  const newWarning = hasBaseline ? report.comparison.new.warning : currentWarning;
  const reasons = [];
  if (failOn === "critical" && currentCritical > 0) {
    reasons.push(`${currentCritical} current critical finding(s)`);
  }
  if (failOn === "warning" && currentCritical + currentWarning > 0) {
    reasons.push(
      `${currentCritical} current critical and ${currentWarning} current warning finding(s)`
    );
  }
  if (failOn === "new-critical" && newCritical > 0) {
    reasons.push(
      `${newCritical} ${hasBaseline ? "new or worsened" : "current"} critical finding(s)`
    );
  }
  if (failOn === "new-warning" && newCritical + newWarning > 0) {
    reasons.push(
      `${newCritical} ${hasBaseline ? "new or worsened" : "current"} critical and ${newWarning} ${hasBaseline ? "new or worsened" : "current"} warning finding(s)`
    );
  }
  const operationalError = strict && report.counts.unknown > 0;
  if (operationalError) {
    reasons.push(
      `${report.counts.unknown} unknown finding(s) cannot pass in strict mode`
    );
  }
  const result = {
    failOn,
    strict,
    passed: reasons.length === 0,
    operationalError,
    reasons
  };
  return { ...report, policy: result };
}
function policyExitCode(report) {
  if (report.policy.operationalError) return 2;
  return report.policy.passed ? 0 : 1;
}

// src/runner.ts
async function baselinePathInsideTarget(target, baselinePath) {
  if (!baselinePath) return null;
  const targetRoot = (0, import_node_path4.resolve)(target);
  const targetStat = await (0, import_promises4.stat)(targetRoot).catch(() => null);
  if (!targetStat?.isDirectory()) return null;
  const relativePath = (0, import_node_path4.relative)(targetRoot, (0, import_node_path4.resolve)(baselinePath));
  if (relativePath.length === 0 || relativePath === ".." || relativePath.startsWith(`..${import_node_path4.sep}`) || (0, import_node_path4.isAbsolute)(relativePath)) {
    return null;
  }
  return escape(relativePath.split(import_node_path4.sep).join("/"), {
    magicalBraces: true
  });
}
async function runAudit(options) {
  const resolvedConfig = await resolveConfigPath(
    options.target,
    options.configPath
  );
  const { config, source } = await loadConfig(
    resolvedConfig.path,
    resolvedConfig.required
  );
  const baselineExclusion = await baselinePathInsideTarget(
    options.target,
    options.baselinePath
  );
  const excludes = [...config.excludes];
  if (baselineExclusion && !excludes.includes(baselineExclusion)) {
    excludes.push(baselineExclusion);
  }
  const auditOptions = {
    now: options.now ?? /* @__PURE__ */ new Date(),
    staleDays: options.staleDays ?? config.staleDays,
    largeFileBytes: options.largeFileBytes ?? Math.floor(config.largeFileMB * 1024 * 1024),
    maxTodoMatches: options.maxTodoMatches,
    offline: options.offline,
    githubToken: options.githubToken,
    excludes,
    ...options.signal ? { signal: options.signal } : {}
  };
  let report = await auditTarget(options.target, auditOptions);
  if (options.baselinePath) {
    const baseline = await loadBaseline(options.baselinePath);
    report = compareWithBaseline(
      report,
      baseline.report,
      baseline.source
    );
  }
  report = evaluatePolicy(
    report,
    options.failOn ?? config.policy.failOn,
    options.strict ?? config.policy.strict
  );
  return {
    report,
    exitCode: policyExitCode(report),
    configSource: source
  };
}

// src/action.ts
function input(name) {
  const normalized2 = `INPUT_${name.toUpperCase().replaceAll(" ", "_")}`;
  const underscored = normalized2.replaceAll("-", "_");
  return (process.env[normalized2] ?? process.env[underscored] ?? "").trim();
}
function commandEscape(value) {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}
function propertyEscape(value) {
  return commandEscape(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
function annotate(level, finding2) {
  process.stdout.write(
    `::${level} title=${propertyEscape(`RepoLens \xB7 ${finding2.title}`)}::${commandEscape(finding2.summary)}
`
  );
}
async function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) return;
  await (0, import_promises5.appendFile)(outputFile, `${name}=${String(value)}
`, "utf8");
}
function actionDirectory() {
  const base = process.env.RUNNER_TEMP ? (0, import_node_path5.resolve)(process.env.RUNNER_TEMP) : (0, import_node_path5.resolve)(".repolens-action");
  const suffix = [
    process.env.GITHUB_RUN_ID ?? "local",
    process.env.GITHUB_JOB ?? "job",
    process.env.GITHUB_ACTION ?? "action"
  ].join("-").replaceAll(/[^A-Za-z0-9._-]/g, "_");
  return (0, import_node_path5.join)(base, `repolens-${suffix}`);
}
async function writeActionReports(report) {
  const output = actionDirectory();
  await (0, import_promises5.mkdir)(output, { recursive: true });
  const paths = {
    json: (0, import_node_path5.join)(output, "repolens-report.json"),
    html: (0, import_node_path5.join)(output, "repolens-report.html"),
    markdown: (0, import_node_path5.join)(output, "repolens-summary.md")
  };
  const markdown = renderGitHubMarkdown(report);
  await Promise.all([
    (0, import_promises5.writeFile)(paths.json, renderJson(report), "utf8"),
    (0, import_promises5.writeFile)(paths.html, renderHtml(report), "utf8"),
    (0, import_promises5.writeFile)(paths.markdown, markdown, "utf8")
  ]);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await (0, import_promises5.appendFile)(process.env.GITHUB_STEP_SUMMARY, markdown, "utf8");
  }
  return paths;
}
async function publishOutputs(report, paths) {
  const values = {
    score: report.score,
    grade: report.grade,
    critical: report.counts.critical,
    warning: report.counts.warning,
    unknown: report.counts.unknown,
    "new-critical": report.comparison.baseline ? report.comparison.new.critical : report.counts.critical,
    "new-warning": report.comparison.baseline ? report.comparison.new.warning : report.counts.warning,
    passed: String(report.policy.passed),
    "report-json": paths.json,
    "report-html": paths.html,
    "report-markdown": paths.markdown
  };
  for (const [name, value] of Object.entries(values)) {
    await setOutput(name, value);
  }
}
function emitAnnotations(report) {
  for (const finding2 of report.findings) {
    if (finding2.severity === "critical") annotate("error", finding2);
    else if (finding2.severity === "warning") annotate("warning", finding2);
    else if (finding2.severity === "unknown") annotate("notice", finding2);
  }
}
async function main() {
  const workspace = (0, import_node_path5.resolve)(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const targetInput = input("target") || ".";
  const target = targetInput === "." ? workspace : (0, import_node_path5.resolve)(workspace, targetInput);
  const configInput = input("config");
  const baselineInput = input("baseline");
  const failOnInput = input("fail-on");
  const failOn = failOnInput ? parseFailOn(failOnInput, "action input fail-on") : null;
  const result = await runAudit({
    target,
    configPath: configInput ? (0, import_node_path5.resolve)(workspace, configInput) : null,
    baselinePath: baselineInput ? (0, import_node_path5.resolve)(workspace, baselineInput) : null,
    failOn,
    strict: null,
    offline: false,
    staleDays: null,
    largeFileBytes: null,
    maxTodoMatches: 50,
    githubToken: process.env.GITHUB_TOKEN || null
  });
  const paths = await writeActionReports(result.report);
  await publishOutputs(result.report, paths);
  emitAnnotations(result.report);
  process.exitCode = result.exitCode;
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `::error title=${propertyEscape("RepoLens execution error")}::${commandEscape(message)}
`
  );
  process.stderr.write(`RepoLens: ${message}
`);
  process.exitCode = 2;
});
