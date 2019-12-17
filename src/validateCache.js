import path from 'path';
import fs from './utils/fs';
import makeDir from 'make-dir';
import readPkg from 'read-pkg';
import { cacheDir } from './paths';

// This file could be written much better.
// Ideally it should just return a boolean of the cache is valid or not
// right now it also save the last package.json to cache.
// I don't like it, But it will do for now.

// Conditions for cache invalidation (return false):
// 1. The build dir is not exist for example:
//    specs/fixtures/basic/node_modules/.cache/
//    autodll-webpack-plugin/development_instance_0_8d5207f894c329f437bd1ff655c7379a
// 2. The previous package.json is not stored in cache
// 3. The previous package.json diffrent from the current package.json
// 4. The previous dll-timestamps.json in not stored in the cache
// 5. The previous dll-timestamps.json diffrent from the current dll-timestamps.json

const validateCache = settings => {
  const prevPkgPath = path.join(cacheDir, 'package.json.hash');
  const prevTimestampsPath = path.join(cacheDir, 'dll-timestamps.json');

  return Promise.all([
    fs.lstatAsync(path.join(cacheDir, settings.hash)).catch(() => null),
    fs.readFileAsync(prevPkgPath).catch(() => null),
    readPkg(settings.context).catch(() => null),
    fs.readFileAsync(prevTimestampsPath).catch(() => null),
    getDllTimestamps(settings),
  ]).then(([buildHashDirExist, prevPkgHash, pkg, prevTimestampsHash, timestamps]) => {
    const pkgHash = JSON.stringify(pkg);
    const timeStampsHash = JSON.stringify(timestamps);

    if (
      buildHashDirExist &&
      prevPkgHash && prevPkgHash.toString() === pkgHash &&
      prevTimestampsHash && prevTimestampsHash.toString() === timeStampsHash
    ) {
      return true;
    }

    return makeDir(cacheDir)
      .then(() => fs.writeFileAsync(prevPkgPath, pkgHash))
      .then(() => fs.writeFileAsync(prevTimestampsPath, timeStampsHash))
      .then(() => false);
  });
};

export default validateCache;

function getDllTimestamps(settings) {
  // For each item in settings.entry, get the path it resolves to using Node's module lookup.
  let dlls = [];
  for (let key of Object.keys(settings.entry)) {
    let val = settings.entry[key];
    if (!Array.isArray(val)) val = [val];
    for (let entrypt of val) {
      // eg 'react', 'react-dom', etc
      let p = require.resolve(entrypt, { paths: [settings.context] });
      dlls.push(p);
    }
  }

  // Stat each item to create the DLL timestamps object.
  let mtimes = dlls.map(p =>
    fs
      .lstatAsync(p)
      .then(st => st.mtime)
      .catch(() => -1)
  );
  return Promise.all(mtimes).then(mtimes =>
    dlls.reduce((obj, dll, i) => {
      obj[dll] = mtimes[i];
      return obj;
    }, {})
  );
}
