/**
 * electron-builder afterPack hook
 * 1. 根据目标平台和架构删除不需要的 Python 运行时
 * 2. macOS 专业 ad-hoc 签名
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function(context) {
  const { electronPlatformName, arch, appOutDir } = context;

  // ============================================================================
  // Part 1: 清理不需要的 Python 运行时
  // ============================================================================

  console.log('');
  console.log('========================================');
  console.log('[afterPack] Cleaning up Python runtimes');
  console.log('========================================');
  console.log(`Platform: ${electronPlatformName}`);
  console.log(`Arch: ${arch} (${getArchName(arch)})`);
  console.log(`Output: ${appOutDir}`);
  console.log('');

  let resourcesDir;

  // 确定 Resources 目录位置
  if (electronPlatformName === 'darwin') {
    // macOS: project4.app/Contents/Resources
    resourcesDir = path.join(appOutDir, 'project4.app', 'Contents', 'Resources');
  } else if (electronPlatformName === 'win32') {
    // Windows: resources/
    resourcesDir = path.join(appOutDir, 'resources');
  } else {
    // Linux: resources/
    resourcesDir = path.join(appOutDir, 'resources');
  }

  if (fs.existsSync(resourcesDir)) {
    console.log(`Resources directory: ${resourcesDir}`);
    console.log('');

    // 列出当前的 Python 目录
    console.log('Python directories before cleanup:');
    const pythonDirs = ['python-arm64', 'python-x64', 'python-win-x64', 'python'];
    pythonDirs.forEach(dir => {
      const fullPath = path.join(resourcesDir, dir);
      if (fs.existsSync(fullPath)) {
        const size = getFolderSize(fullPath);
        console.log(`  ✓ ${dir}: ${(size / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log(`  ✗ ${dir}: not found`);
      }
    });
    console.log('');

    // 根据平台和架构删除不需要的 Python
    const toRemove = [];

    if (electronPlatformName === 'darwin') {
      // macOS
      // 使用字符串比较而不是数字，因为 electron-builder 可能返回字符串
      const archStr = String(arch);

      if (arch === 0 || archStr === 'arm64') {
        // arm64: 保留 python-arm64，删除 python-x64 和 python (Windows)
        toRemove.push('python-x64', 'python');
        console.log('Building for macOS arm64:');
        console.log('  ✓ Keep: python-arm64');
        console.log('  ✗ Remove: python-x64, python');
      } else if (arch === 1 || archStr === 'x64') {
        // x64: 保留 python-x64，删除 python-arm64 和 python (Windows)
        toRemove.push('python-arm64', 'python');
        console.log('Building for macOS x64:');
        console.log('  ✓ Keep: python-x64');
        console.log('  ✗ Remove: python-arm64, python');
      } else if (arch === 2 || archStr === 'universal') {
        // universal: 保留 python-arm64 和 python-x64，删除 python (Windows)
        toRemove.push('python');
        console.log('Building for macOS universal:');
        console.log('  ✓ Keep: python-arm64, python-x64');
        console.log('  ✗ Remove: python');
      } else {
        // 未知架构，根据目录名称判断
        console.log(`Unknown arch value: ${arch} (${archStr})`);
        console.log('Attempting to detect architecture from output directory...');

        if (appOutDir.includes('arm64')) {
          toRemove.push('python-x64', 'python');
          console.log('Detected arm64 from path');
          console.log('  ✓ Keep: python-arm64');
          console.log('  ✗ Remove: python-x64, python');
        } else if (appOutDir.includes('x64') || appOutDir.includes('mac') && !appOutDir.includes('arm64')) {
          toRemove.push('python-arm64', 'python');
          console.log('Detected x64 from path');
          console.log('  ✓ Keep: python-x64');
          console.log('  ✗ Remove: python-arm64, python');
        } else {
          console.log('Could not detect architecture, keeping all Python directories');
        }
      }
    } else if (electronPlatformName === 'win32') {
      // Windows: 保留 python-win-x64，删除 python-arm64、python-x64 和 python
      toRemove.push('python-arm64', 'python-x64', 'python');
      console.log('Building for Windows:');
      console.log('  ✓ Keep: python-win-x64');
      console.log('  ✗ Remove: python-arm64, python-x64, python');
    } else if (electronPlatformName === 'linux') {
      // Linux: 删除所有 Python（如果需要 Linux Python，需要单独准备）
      toRemove.push('python-arm64', 'python-x64', 'python');
      console.log('Building for Linux:');
      console.log('  ✗ Remove: python-arm64, python-x64, python');
      console.log('  Note: Linux Python runtime not configured');
    }

    console.log('');

    // 执行删除
    let totalRemoved = 0;
    for (const dir of toRemove) {
      const fullPath = path.join(resourcesDir, dir);
      if (fs.existsSync(fullPath)) {
        const size = getFolderSize(fullPath);
        console.log(`Removing ${dir}...`);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`  ✓ Removed ${dir} (${(size / 1024 / 1024).toFixed(2)} MB)`);
          totalRemoved += size;
        } catch (error) {
          console.error(`  ✗ Failed to remove ${dir}:`, error.message);
        }
      }
    }

    console.log('');
    console.log(`Total removed: ${(totalRemoved / 1024 / 1024).toFixed(2)} MB`);
    console.log('');

    // 显示清理后的状态
    console.log('Python directories after cleanup:');
    pythonDirs.forEach(dir => {
      const fullPath = path.join(resourcesDir, dir);
      if (fs.existsSync(fullPath)) {
        const size = getFolderSize(fullPath);
        console.log(`  ✓ ${dir}: ${(size / 1024 / 1024).toFixed(2)} MB`);
      }
    });

    // 显示最终 Resources 目录大小
    const finalSize = getFolderSize(resourcesDir);
    console.log('');
    console.log(`Final Resources size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`[afterPack] Resources directory not found: ${resourcesDir}`);
  }

  console.log('');
  console.log('========================================');
  console.log('[afterPack] Python cleanup complete');
  console.log('========================================');
  console.log('');

  // ============================================================================
  // Part 2: macOS 专业 ad-hoc 签名
  // ============================================================================

  // Only process macOS
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlementsPath = path.join(__dirname, '..', 'resources', 'entitlements.mac.plist');

  console.log('');
  console.log('========================================');
  console.log('[afterPack] macOS Code Signing');
  console.log('========================================');
  console.log(`App path: ${appPath}`);
  console.log('');

  try {
    // 1. Remove quarantine attribute (if exists)
    try {
      execSync(`xattr -dr com.apple.quarantine "${appPath}"`, { stdio: 'pipe' });
      console.log('✓ Removed quarantine attribute');
    } catch {
      console.log('  (No quarantine attribute to remove)');
    }

    // 2. Ad-hoc sign with entitlements
    const codesignCmd = `codesign --force --deep -s - --entitlements "${entitlementsPath}" --timestamp=none "${appPath}"`;
    console.log('Executing ad-hoc signing...');
    execSync(codesignCmd, { stdio: 'inherit' });

    // 3. Verify signature
    console.log('Verifying signature...');
    const verifyOutput = execSync(`codesign -dv "${appPath}" 2>&1`, { encoding: 'utf8' });
    console.log(verifyOutput);

    console.log('');
    console.log('✅ Professional ad-hoc signing complete');
  } catch (error) {
    console.error('');
    console.error('❌ Signing failed:', error.message);
    console.error('Build will continue without signing');
    // Don't throw error, let build continue
  }

  console.log('');
  console.log('========================================');
  console.log('[afterPack] All tasks complete');
  console.log('========================================');
  console.log('');
};

// Helper functions

function getArchName(arch) {
  const archMap = {
    0: 'arm64',
    1: 'x64',
    2: 'universal',
    3: 'ia32'
  };
  return archMap[arch] || 'unknown';
}

function getFolderSize(folderPath) {
  let size = 0;

  if (!fs.existsSync(folderPath)) {
    return size;
  }

  try {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        size += getFolderSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (error) {
    console.error(`Error calculating size for ${folderPath}:`, error.message);
  }

  return size;
}
