/**
 * 工单系统数据提取自动化脚本
 *
 * 此脚本通过 Playwright MCP 自动提取工单系统中的所有待办工单数据
 * 支持智能登录检测，自动等待用户登录
 */

// 配置
const CONFIG = {
  loginUrl:
    "http://k.test-adm.weoa.com/pmbank-um/index.html?target=https%3A%2F%2Fk.test-adm.weoa.com%2Fs%2Frcs-ucsportalweb%2F%23%2F%3Fsso_ticket%3Df4cd540a7c30169660eb64c48fbef16346b4fd98ee177462921b183dbafbd265%26",
  systemName: "工单系统（企金）",
  loginCheckInterval: 3000, // 登录检测间隔（毫秒）
  maxLoginWaitTime: 300000, // 最大等待登录时间（5分钟）
  pageTimeout: 10000, // 页面操作超时时间（毫秒）
};

/**
 * 检测是否已登录工单系统
 *
 * @param {Page} page - Playwright Page 对象
 * @returns {Promise<boolean>} 是否已登录
 */
async function isLoggedIn(page) {
  try {
    const url = page.url();
    const title = await page.title();

    // 方法1: 检查 URL（登录页面包含 /pmbank-um/ 或 login）
    if (url.includes("/pmbank-um/") || url.includes("login")) {
      return false;
    }

    // 方法2: 检查页面标题
    if (title.includes("统一登录平台") || title.includes("统一登录")) {
      return false;
    }

    // 方法3: 检查是否存在登录表单（未登录的标志）
    const hasLoginForm =
      (await page
        .locator('input[type="password"], button:has-text("登")')
        .count()) > 0;
    if (hasLoginForm) {
      return false;
    }

    // 方法4: 检查是否存在主界面元素（已登录的标志）
    const hasMainUI =
      (await page
        .locator("text=Welcome!, text=工单系统, text=微众银行统一客服平台")
        .count()) > 0;
    if (hasMainUI) {
      return true;
    }

    // 默认认为未登录
    return false;
  } catch (error) {
    console.log(`登录状态检测出错: ${error.message}`);
    return false;
  }
}

/**
 * 等待用户登录
 *
 * @param {Page} page - Playwright Page 对象
 * @returns {Promise<boolean>} 是否登录成功
 */
async function waitForLogin(page) {
  console.log("⏳ 等待用户登录工单系统...");
  console.log("💡 提示：请在浏览器中完成登录操作");

  const startTime = Date.now();

  while (Date.now() - startTime < CONFIG.maxLoginWaitTime) {
    // 检查是否已登录
    if (await isLoggedIn(page)) {
      console.log("✅ 检测到用户已登录");
      return true;
    }

    // 等待一段时间后再次检测
    await page.waitForTimeout(CONFIG.loginCheckInterval);
  }

  console.log("❌ 登录超时");
  return false;
}

/**
 * 等待主界面完全加载并稳定
 *
 * @param {Page} page - Playwright Page 对象
 */
async function waitForMainPageReady(page) {
  console.log("⏳ 等待主界面完全加载...");

  // 1. 等待网络空闲
  await page.waitForLoadState("networkidle");

  // 2. 等待关键元素出现（顶部菜单的 SVG 图标）
  try {
    await page
      .locator("svg")
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
    console.log("  ✅ 顶部菜单已加载");
  } catch (error) {
    console.log("  ⚠️ 顶部菜单加载超时，继续等待...");
  }

  // 3. 等待页面稳定（检查 DOM 是否还在变化）
  let previousBodyHTML = "";
  let stableCount = 0;
  const maxChecks = 10; // 最多检查10次

  for (let i = 0; i < maxChecks; i++) {
    await page.waitForTimeout(500);
    const currentBodyHTML = await page.evaluate(
      () => document.body.innerHTML.length
    );

    if (currentBodyHTML === previousBodyHTML) {
      stableCount++;
      if (stableCount >= 3) {
        // 连续3次稳定则认为页面已就绪
        console.log("  ✅ 页面已稳定");
        break;
      }
    } else {
      stableCount = 0;
    }

    previousBodyHTML = currentBodyHTML;
  }

  // 4. 最后再等待1秒确保完全稳定
  await page.waitForTimeout(1000);
  console.log("✅ 主界面加载完成");
}

/**
 * 确保已登录工单系统
 *
 * @param {Page} page - Playwright Page 对象
 * @returns {Promise<boolean>} 是否已登录
 */
async function ensureLoggedIn(page) {
  // 导航到工单系统登录页面
  const currentUrl = page.url();
  if (!currentUrl.includes("k.test-adm.weoa.com")) {
    console.log("📍 导航到工单系统...");
    await page.goto(CONFIG.loginUrl);
    await page.waitForTimeout(2000);
  }

  // 检查是否已登录
  if (await isLoggedIn(page)) {
    console.log("✅ 已登录工单系统");
    await waitForMainPageReady(page);
    return true;
  }

  // 等待用户登录
  const loginSuccess = await waitForLogin(page);
  if (loginSuccess) {
    await waitForMainPageReady(page);
  }
  return loginSuccess;
}

/**
 * 带重试机制的点击函数
 *
 * @param {Locator} locator - Playwright Locator 对象
 * @param {string} description - 操作描述
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<boolean>} 是否点击成功
 */
async function clickWithRetry(locator, description, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`  🔄 尝试${description}（第 ${i + 1}/${maxRetries} 次）...`);

      // 等待元素可见
      await locator.waitFor({ state: "visible", timeout: 5000 });

      // 等待元素可点击
      await locator.waitFor({ state: "attached", timeout: 5000 });

      // 点击元素
      await locator.click({ timeout: 5000 });

      console.log(`  ✅ ${description}成功`);
      return true;
    } catch (error) {
      console.log(
        `  ⚠️ ${description}失败（第 ${i + 1} 次）: ${error.message}`
      );

      if (i < maxRetries - 1) {
        console.log(`  ⏳ 等待 2 秒后重试...`);
        await locator.page().waitForTimeout(2000);
      }
    }
  }

  console.log(`  ❌ ${description}失败，已达到最大重试次数`);
  return false;
}

/**
 * 主函数：提取所有工单数据
 *
 * 此函数应该通过 Playwright MCP 的 browser_run_code 工具执行
 *
 * @param {Page} page - Playwright Page 对象
 * @returns {Promise<Array>} 提取的工单数据数组
 */
async function extractAllWorkOrders(page) {
  const allTickets = [];
  const manualReviewTickets = []; // 需要人工确认的工单
  let globalIndex = 0;

  try {
    console.log("=== 开始提取工单数据 ===");

    // 步骤 1：导航到工单系统（假设已经在登录后的页面）
    console.log("📍 导航到工单系统...");

    // 点击顶部菜单（带重试）
    const topSvg = page.locator("svg").first();
    if (!(await clickWithRetry(topSvg, "点击顶部 SVG 图标"))) {
      throw new Error("无法点击顶部 SVG 图标");
    }
    await page.waitForTimeout(1000);

    const topHeaderItem = page.locator(".top-header-item").first();
    if (!(await clickWithRetry(topHeaderItem, "点击顶部菜单项"))) {
      throw new Error("无法点击顶部菜单项");
    }
    await page.waitForTimeout(1000);

    // 点击"工单系统（企金）"（带重试）
    const systemLink = page.getByText(CONFIG.systemName);
    if (!(await clickWithRetry(systemLink, "点击工单系统（企金）"))) {
      throw new Error("无法点击工单系统（企金）");
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // 等待 iframe 加载

    // 切换到 iframe
    const frame = page.frameLocator("iframe");

    // 点击"待处理任务"（带重试）
    const pendingTasksLink = frame.getByText(/待处理任务/);
    console.log('  🔄 尝试点击"待处理任务"...');
    try {
      await pendingTasksLink.click({ timeout: 10000 });
      console.log('  ✅ 点击"待处理任务"成功');
    } catch (error) {
      console.log(`  ⚠️ 点击"待处理任务"失败: ${error.message}`);
      throw new Error('无法点击"待处理任务"');
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✅ 已进入待处理任务页面");

    // 步骤 2：获取分页信息
    let totalPages = 1;
    try {
      const paginationText = await frame
        .locator(".ant-pagination-total-text")
        .textContent();
      if (paginationText) {
        const pageMatch = paginationText.match(/共(\d+)页/);
        if (pageMatch) {
          totalPages = parseInt(pageMatch[1], 10);
          console.log(`📄 检测到分页：共 ${totalPages} 页`);
        }
      }
    } catch (error) {
      console.log(`⚠️ 无法获取分页信息，假设只有1页`);
    }

    // 步骤 3：遍历所有页面
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.log(
        `\n📄 ========== 开始处理第 ${currentPage}/${totalPages} 页 ==========`
      );

      // 如果不是第一页，需要跳转
      if (currentPage > 1) {
        try {
          const pageButton = frame.locator(
            `.ant-pagination-item-${currentPage}`
          );
          if ((await pageButton.count()) > 0) {
            await pageButton.click();
            await page.waitForLoadState("networkidle");
            console.log(`✅ 已跳转到第 ${currentPage} 页`);
          } else {
            const nextButton = frame.locator(
              ".ant-pagination-next:not(.ant-pagination-disabled)"
            );
            if ((await nextButton.count()) > 0) {
              await nextButton.click();
              await page.waitForLoadState("networkidle");
              console.log(`✅ 已点击下一页`);
            } else {
              console.log(`⚠️ 无法跳转到第 ${currentPage} 页`);
              break;
            }
          }
          await page.waitForTimeout(1000);
        } catch (error) {
          console.log(`❌ 跳转失败: ${error.message}`);
          break;
        }
      }

      // 获取当前页的工单数量
      const itemCount = await frame.locator("tr.ant-table-row").count();
      console.log(`📋 第 ${currentPage} 页共找到 ${itemCount} 个工单`);

      // 步骤 4：遍历当前页的每个工单
      for (let i = 0; i < itemCount; i++) {
        const currentTicketIndex = globalIndex + 1; // 预计算索引，但不立即递增
        try {
          console.log(
            `\n🔄 正在处理第 ${currentTicketIndex} 个工单（第 ${currentPage} 页，第 ${
              i + 1
            }/${itemCount} 个）...`
          );

          // 4.1 点击工单编号
          // 重要：每次返回列表后重新获取工单链接，避免元素引用失效
          const caseLinks = frame.locator("a.case-link");
          await caseLinks.nth(i).click();
          await page.waitForTimeout(1000);
          await page.waitForLoadState("networkidle");

          // 获取任务单编号
          const tabTitle = await frame
            .locator(".fes-tabs-tab")
            .filter({ hasText: "E" })
            .first()
            .textContent();
          const workOrderNumber = tabTitle.trim();
          console.log(`  📋 任务单编号：${workOrderNumber}`);

          // 4.2 等待处理记录加载，然后点击"查看"按钮
          // 等待处理记录区域加载
          await page.waitForTimeout(1500); // 增加等待时间，确保处理记录加载完成

          const viewButtons = frame.getByRole("button", {
            name: "查看",
            exact: true,
          });
          const buttonCount = await viewButtons.count();
          if (buttonCount > 0) {
            await viewButtons.last().click();
            await page.waitForTimeout(1000);
            await page.waitForLoadState("networkidle");
            console.log(
              `  ✅ 已打开查看弹窗（共${buttonCount}个查看按钮，点击了最后一个）`
            );
          } else {
            // 没有查看按钮，记录为需要人工确认的工单
            console.log(`  ⚠️ 未找到查看按钮，标记为待人工确认`);

            manualReviewTickets.push({
              workOrderNumber,
              ticketIndex: currentTicketIndex,
              页码: currentPage,
              页内序号: i + 1,
              原因: "未找到查看按钮",
              备注: "此工单可能没有贷款信息记录，需要人工确认业务类型",
            });

            globalIndex++;

            // 关闭标签页并返回列表
            await frame
              .locator("div:nth-child(3) > .fes-tabs-tab-close")
              .click();
            await page.waitForTimeout(300);
            await frame
              .locator("div")
              .filter({ hasText: /^待处理任务$/ })
              .first()
              .click();
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(500);
            console.log(`  ✅ 已返回工单列表`);

            continue; // 跳过后续处理，继续下一个工单
          }

          // 4.3 点击小眼睛按钮显示敏感信息
          const modal = frame
            .locator(".fes-modal-wrapper")
            .filter({ hasText: "查看贷款信息记录" })
            .first();
          const eyeButton = modal
            .locator(".fes-grid")
            .first()
            .locator(".fes-grid-item")
            .nth(1)
            .locator("button.fes-btn-type-link")
            .first();

          if ((await eyeButton.count()) > 0) {
            await eyeButton.click();
            await page.waitForTimeout(500);
            console.log(`  ✅ 已显示敏感信息`);
          }

          // 4.4 提取弹窗数据
          const ticketData = await modal.evaluate((el) => {
            const data = {};
            const items = el.querySelectorAll(".fes-grid-item");
            items.forEach((item) => {
              const text = item.textContent.trim();
              const match = text.match(/^([^:：]+)[：:](.+)$/);
              if (match) {
                const label = match[1].trim();
                const value = match[2].trim();
                data[label] = value;
              }
            });
            return data;
          });

          // 添加任务单编号
          ticketData.workOrderNumber = workOrderNumber;
          ticketData.ticketIndex = currentTicketIndex;
          ticketData.页码 = currentPage;
          ticketData.页内序号 = i + 1;

          // 提取产品信息（最多10个）
          const products = [];
          for (let j = 1; j <= 10; j++) {
            const product = ticketData[`产品${j}`] || "";
            if (product && product.trim()) {
              products.push(product);
            }
          }

          ticketData.products = products;
          ticketData.isMultiProduct = products.length > 1;
          ticketData.productCount = products.length;

          // 提取借据号信息（最多10个）
          const loanNotes = [];
          for (let j = 1; j <= 10; j++) {
            const loanNote = ticketData[`借据号${j}`] || "";
            if (loanNote && loanNote.trim()) {
              loanNotes.push(loanNote);
            }
          }

          ticketData.loanNotes = loanNotes;
          ticketData.loanNoteCount = loanNotes.length;

          allTickets.push(ticketData);
          globalIndex++; // 只有成功提取数据后才递增索引
          console.log(`  ✅ 工单 ${currentTicketIndex} 数据提取完成`);

          // 4.5 关闭弹窗
          const closeButton = modal.locator(".fes-modal-close");
          await closeButton.click();
          await page.waitForTimeout(300);

          // 4.6 关闭标签页并返回列表
          await frame.locator("div:nth-child(3) > .fes-tabs-tab-close").click();
          await page.waitForTimeout(300);
          await frame
            .locator("div")
            .filter({ hasText: /^待处理任务$/ })
            .first()
            .click();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(500);
          console.log(`  ✅ 已返回工单列表`);
        } catch (error) {
          console.log(
            `  ❌ 处理第 ${currentTicketIndex} 个工单时出错: ${error.message}`
          );
          console.log(`  ⚠️ 跳过此工单，不递增索引`);

          // 尝试返回列表
          try {
            await frame
              .locator("div:nth-child(3) > .fes-tabs-tab-close")
              .click()
              .catch(() => {});
            await frame
              .locator("div")
              .filter({ hasText: /^待处理任务$/ })
              .first()
              .click();
            await page.waitForLoadState("networkidle");
          } catch (backError) {
            console.log(`  ❌ 返回列表失败`);
          }
        }
      }

      console.log(`\n✅ 第 ${currentPage} 页处理完成`);
    }

    console.log(`\n\n========================================`);
    console.log(`📊 数据提取完成！共提取 ${allTickets.length} 个工单`);
    console.log(`========================================`);

    return allTickets;
  } catch (error) {
    console.log(`❌ 执行失败：${error.message}`);
    throw error;
  }
}

/**
 * 数据筛选函数
 *
 * @param {Array} allTickets - 所有工单数据
 * @returns {Object} { enterpriseData, personalData }
 */
function filterWorkOrders(allTickets) {
  // 个人数据筛选规则
  const validPersonalProductTypes = ["新个贷", "企业贷", "老个贷"];
  const validPersonalProductNames = [
    "新个人经营贷(单笔单批)",
    "新个人经营贷(循环)",
    "个人经营贷",
  ];

  const personalData = allTickets.filter((ticket) => {
    const productType = ticket["产品类型"] || "";
    const productName = ticket["产品1"] || "";
    return (
      validPersonalProductTypes.some((pt) => productType.includes(pt)) &&
      validPersonalProductNames.some((pn) => productName.includes(pn))
    );
  });

  // 企业数据筛选规则
  const personalProductNames = personalData.map((t) => t["产品1"] || "");
  const enterpriseData = allTickets.filter((ticket) => {
    const productType = ticket["产品类型"] || "";
    const productName = ticket["产品1"] || "";
    const isEnterpriseType =
      productType.includes("企业贷") || productType.includes("老个贷");
    const isNotPersonal = !personalProductNames.includes(productName);
    return isEnterpriseType && isNotPersonal;
  });

  console.log(
    `\n✅ 筛选后：企业数据 ${enterpriseData.length} 个，个人数据 ${personalData.length} 个`
  );

  return { enterpriseData, personalData };
}

/**
 * 导出为 CSV 格式（根据业务类型动态生成列）
 *
 * @param {Array} data - 工单数据数组
 * @param {string} businessType - 业务类型（用于确定列结构）
 * @returns {string} CSV 格式的字符串
 */
function exportToCSV(data, businessType = "") {
  if (data.length === 0) {
    return "任务单编号,业务类型,产品类型,企业名称,客户名称,CCIF,ECIF,核身通过,数据类型\n";
  }

  // 根据业务类型确定列结构
  let headers, rowMapper;

  if (businessType === "定期贷款解锁") {
    // 定期贷款解锁：包含借据号字段（最多10个）
    headers = [
      "任务单编号",
      "业务类型",
      "产品类型",
      "企业名称",
      "客户名称",
      "CCIF",
      "ECIF",
      "核身通过",
      "借据号1",
      "借据号2",
      "借据号3",
      "借据号4",
      "借据号5",
      "借据号6",
      "借据号7",
      "借据号8",
      "借据号9",
      "借据号10",
      "数据类型",
    ];

    rowMapper = (ticket) => [
      ticket.workOrderNumber || "",
      ticket["业务类型"] || "",
      ticket["产品类型"] || "",
      ticket["企业名称"] || "",
      ticket["客户名称"] || ticket["姓名"] || "",
      ticket["CCIF"] || "",
      ticket["ECIF"] || "",
      ticket["核身通过"] || "",
      ticket["借据号1"] || "",
      ticket["借据号2"] || "",
      ticket["借据号3"] || "",
      ticket["借据号4"] || "",
      ticket["借据号5"] || "",
      ticket["借据号6"] || "",
      ticket["借据号7"] || "",
      ticket["借据号8"] || "",
      ticket["借据号9"] || "",
      ticket["借据号10"] || "",
      ticket["产品类型"]?.includes("企业贷") ? "企业" : "个人",
    ];
  } else {
    // 贷款产品取消额度：包含产品字段（最多10个）
    headers = [
      "任务单编号",
      "业务类型",
      "产品类型",
      "企业名称",
      "客户名称",
      "CCIF",
      "ECIF",
      "核身通过",
      "产品1",
      "产品2",
      "产品3",
      "产品4",
      "产品5",
      "产品6",
      "产品7",
      "产品8",
      "产品9",
      "产品10",
      "数据类型",
    ];

    rowMapper = (ticket) => [
      ticket.workOrderNumber || "",
      ticket["业务类型"] || "",
      ticket["产品类型"] || "",
      ticket["企业名称"] || "",
      ticket["客户名称"] || ticket["姓名"] || "",
      ticket["CCIF"] || "",
      ticket["ECIF"] || "",
      ticket["核身通过"] || "",
      ticket["产品1"] || "",
      ticket["产品2"] || "",
      ticket["产品3"] || "",
      ticket["产品4"] || "",
      ticket["产品5"] || "",
      ticket["产品6"] || "",
      ticket["产品7"] || "",
      ticket["产品8"] || "",
      ticket["产品9"] || "",
      ticket["产品10"] || "",
      ticket["产品类型"]?.includes("企业贷") ? "企业" : "个人",
    ];
  }

  const rows = data.map((ticket) => {
    return rowMapper(ticket)
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * 按业务类型分组工单
 *
 * @param {Array} allTickets - 所有工单数据
 * @returns {Object} 按业务类型分组的工单数据
 */
function groupByBusinessType(allTickets) {
  const groups = {};

  allTickets.forEach((ticket) => {
    const businessType = ticket["业务类型"] || "未知类型";

    if (!groups[businessType]) {
      groups[businessType] = [];
    }

    groups[businessType].push(ticket);
  });

  return groups;
}

/**
 * 业务类型到英文文件名的映射
 */
const BUSINESS_TYPE_MAPPING = {
  贷款产品取消额度: "cancel_credit_limit",
  定期贷款解锁: "unlock_term_loan",
  未知类型: "unknown",
};

/**
 * 生成文件名（基于业务类型，使用英文）
 *
 * @param {string} businessType - 业务类型
 * @returns {string} 文件名
 */
function generateFileName(businessType) {
  // 使用映射表获取英文文件名
  const englishName =
    BUSINESS_TYPE_MAPPING[businessType] ||
    businessType
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

  return `workorders_${englishName}.csv`;
}

/**
 * 保存 CSV 文件
 *
 * @param {Object} groups - 按业务类型分组的工单数据
 * @param {string} outputDir - 输出目录
 * @returns {Array} 保存结果
 */
function saveCSVFiles(groups, outputDir = ".") {
  const fs = require("fs");
  const path = require("path");

  console.log("\n=== 开始生成 CSV 文件 ===\n");

  const results = [];

  Object.entries(groups).forEach(([businessType, tickets]) => {
    const fileName = generateFileName(businessType);
    const filePath = path.join(outputDir, fileName);
    const csvContent = exportToCSV(tickets, businessType);

    fs.writeFileSync(filePath, csvContent, "utf-8");

    console.log(`✅ ${businessType}：${tickets.length} 个工单`);
    console.log(`   文件：${fileName}`);

    results.push({
      businessType,
      count: tickets.length,
      fileName,
      filePath,
    });
  });

  console.log("\n=== CSV 文件生成完成 ===\n");
  console.log(`总计：${Object.keys(groups).length} 个业务类型`);
  console.log(
    `总工单数：${Object.values(groups).reduce(
      (sum, arr) => sum + arr.length,
      0
    )} 个\n`
  );

  return results;
}

// 导出函数供外部使用
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ensureLoggedIn,
    isLoggedIn,
    waitForLogin,
    clickWithRetry,
    extractAllWorkOrders,
    filterWorkOrders,
    exportToCSV,
    groupByBusinessType,
    generateFileName,
    saveCSVFiles,
    BUSINESS_TYPE_MAPPING,
    CONFIG,
  };
}
