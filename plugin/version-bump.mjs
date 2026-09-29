import { readFileSync, writeFileSync, copyFileSync } from 'fs';

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, '\t'));

// update versions.json with target version and minAppVersion from manifest.json
// but only if the target version is not already in versions.json
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
if (!(targetVersion in versions)) {
	versions[targetVersion] = minAppVersion;
	writeFileSync('versions.json', JSON.stringify(versions, null, '\t'));
}

// Keep the repo-root manifest.json / versions.json in sync.
// The Obsidian submission bot validates the manifest at the REPOSITORY ROOT,
// so these two files must always mirror plugin/manifest.json and plugin/versions.json.
copyFileSync('manifest.json', '../manifest.json');
copyFileSync('versions.json', '../versions.json');