const fs = require('fs');
const path = require('path');

/**
 * 清理文本中的特殊字符
 *
 * @param {string} text - 需要清理的文本
 * @returns {string} 清理后的文本
 */
function cleanText(text) {
  if (!text) return text;

  // 去除外层引号
  text = text.replace(/^"(.*)"$/, '$1');

  // 去除转义引号
  text = text.replace(/""/g, '"');

  // 去除制表符、换行符、回车符
  text = text.replace(/[\t\n\r]/g, '');

  // 去除前后空格
  text = text.trim();

  // 再次清理引号和空格
  text = text.replace(/^["'\s]+|["'\s]+$/g, '');

  return text;
}

/**
 * 计算实际需要的最大列数
 *
 * @param {Array} tickets - 工单数据数组
 * @param {string} fieldPrefix - 字段前缀（如 "产品" 或 "借据号"）
 * @returns {number} 最大列数
 */
function getMaxFieldCount(tickets, fieldPrefix) {
  let maxCount = 0;

  tickets.forEach(ticket => {
    for (let i = 1; i <= 10; i++) {
      const fieldName = `${fieldPrefix}${i}`;
      if (ticket[fieldName] && ticket[fieldName].trim()) {
        maxCount = Math.max(maxCount, i);
      }
    }
  });

  return maxCount;
}

/**
 * 生成CSV文件
 *
 * @param {string} inputFile - 输入的JSON文件路径
 * @param {string} outputDir - 输出目录（可选，默认为当前目录）
 */
function generateCSV(inputFile, outputDir = '.') {
  // 读取数据
  const rawData = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));

  // 如果数据包含 allTickets 字段，则提取它；否则假设数据本身就是数组
  const data = rawData.allTickets || rawData;

  console.log(`\n=== 开始生成 CSV 文件 ===\n`);
  console.log(`📄 读取数据：${data.length} 个工单`);

  // 按业务类型分组（支持中英文字段名）
  const groups = {};
  data.forEach(ticket => {
    const businessType = ticket['业务类型'] || ticket.businessType || '未知类型';
    if (!groups[businessType]) {
      groups[businessType] = [];
    }
    groups[businessType].push(ticket);
  });

  // 生成CSV文件
  Object.entries(groups).forEach(([businessType, tickets]) => {
    let headers, rows;

    if (businessType === '定期贷款解锁') {
      // 计算实际需要的借据号列数（支持中英文字段名）
      let maxLoanNoteCount = 0;
      tickets.forEach(ticket => {
        // 支持 loanNumbers 数组或 借据号1-10 字段
        if (ticket.loanNumbers && Array.isArray(ticket.loanNumbers)) {
          maxLoanNoteCount = Math.max(maxLoanNoteCount, ticket.loanNumbers.length);
        } else {
          for (let i = 1; i <= 10; i++) {
            const fieldName = `借据号${i}`;
            if (ticket[fieldName] && ticket[fieldName].trim()) {
              maxLoanNoteCount = Math.max(maxLoanNoteCount, i);
            }
          }
        }
      });

      console.log(`\n📊 ${businessType}：最多 ${maxLoanNoteCount} 个借据号`);

      // 动态生成借据号列标题
      const loanNoteHeaders = [];
      for (let i = 1; i <= maxLoanNoteCount; i++) {
        loanNoteHeaders.push(`借据号${i}`);
      }

      headers = ['任务单编号', '业务类型', '产品类型', '企业名称', '客户名称', 'CCIF', 'ECIF', '核身通过', ...loanNoteHeaders, '数据类型'];

      rows = tickets.map(t => {
        const loanNoteValues = [];
        // 支持 loanNumbers 数组或 借据号1-10 字段
        if (t.loanNumbers && Array.isArray(t.loanNumbers)) {
          for (let i = 0; i < maxLoanNoteCount; i++) {
            loanNoteValues.push(t.loanNumbers[i] || '');
          }
        } else {
          for (let i = 1; i <= maxLoanNoteCount; i++) {
            loanNoteValues.push(t[`借据号${i}`] || '');
          }
        }

        return [
          t.workOrderNumber || t.taskId || '',
          t['业务类型'] || t.businessType || '',
          t['产品类型'] || t.productType || '',
          cleanText(t['企业名称'] || t.companyName || ''),
          cleanText(t['姓名'] || t['客户名称'] || t.customerName || ''),
          t['CCIF'] || t.ccif || '',
          t['ECIF'] || t.ecif || '',
          t['核身通过'] || t.authPassed || '',
          ...loanNoteValues,
          t.dataType || ((t['产品类型'] || t.productType || '').includes('企业贷') ? '企业' : '个人')
        ];
      });
    } else {
      // 计算实际需要的产品列数（支持中英文字段名）
      let maxProductCount = 0;
      tickets.forEach(ticket => {
        // 支持 products 数组或 产品1-10 字段
        if (ticket.products && Array.isArray(ticket.products)) {
          maxProductCount = Math.max(maxProductCount, ticket.products.length);
        } else {
          for (let i = 1; i <= 10; i++) {
            const fieldName = `产品${i}`;
            if (ticket[fieldName] && ticket[fieldName].trim()) {
              maxProductCount = Math.max(maxProductCount, i);
            }
          }
        }
      });

      console.log(`\n📊 ${businessType}：最多 ${maxProductCount} 个产品`);

      // 动态生成产品列标题
      const productHeaders = [];
      for (let i = 1; i <= maxProductCount; i++) {
        productHeaders.push(`产品${i}`);
      }

      headers = ['任务单编号', '业务类型', '产品类型', '企业名称', '客户名称', 'CCIF', 'ECIF', '核身通过', ...productHeaders, '数据类型'];

      rows = tickets.map(t => {
        const productValues = [];
        // 支持 products 数组或 产品1-10 字段
        if (t.products && Array.isArray(t.products)) {
          for (let i = 0; i < maxProductCount; i++) {
            productValues.push(t.products[i] || '');
          }
        } else {
          for (let i = 1; i <= maxProductCount; i++) {
            productValues.push(t[`产品${i}`] || '');
          }
        }

        return [
          t.workOrderNumber || t.taskId || '',
          t['业务类型'] || t.businessType || '',
          t['产品类型'] || t.productType || '',
          cleanText(t['企业名称'] || t.companyName || ''),
          cleanText(t['姓名'] || t['客户名称'] || t.customerName || ''),
          t['CCIF'] || t.ccif || '',
          t['ECIF'] || t.ecif || '',
          t['核身通过'] || t.authPassed || '',
          ...productValues,
          t.dataType || ((t['产品类型'] || t.productType || '').includes('企业贷') ? '企业' : '个人')
        ];
      });
    }

    // 转换为CSV格式
    const csvRows = rows.map(row =>
      row.map(field => '"' + String(field).replace(/"/g, '""') + '"').join(',')
    );

    const csvContent = [headers.join(','), ...csvRows].join('\n');

    // 生成文件名
    const fileNameMap = {
      '贷款产品取消额度': 'workorders_cancel_credit_limit.csv',
      '定期贷款解锁': 'workorders_unlock_term_loan.csv'
    };

    const fileName = fileNameMap[businessType] || 'workorders_unknown.csv';
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    console.log(`✅ ${businessType}：${tickets.length} 个工单`);
    console.log(`   文件：${fileName}`);
    console.log(`   列数：${headers.length} 列`);
  });

  console.log(`\n📊 总计：${data.length} 个工单`);
  console.log(`\n=== CSV 文件生成完成 ===\n`);
}

// 如果直接运行此脚本
if (require.main === module) {
  const inputFile = process.argv[2] || 'workorders_raw.json';
  const outputDir = process.argv[3] || '.';

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ 错误：找不到输入文件 ${inputFile}`);
    process.exit(1);
  }

  generateCSV(inputFile, outputDir);
}

// 导出函数供外部使用
module.exports = {
  cleanText,
  getMaxFieldCount,
  generateCSV
};
