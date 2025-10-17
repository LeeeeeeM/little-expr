/* 简单测试运行器
 * 直接调用解析器并处理结果
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

// --- 测试运行器 ---
function runTestFile(testFilePath: string, parserType: string = 'separated'): void {
    console.log(`🧪 运行测试文件: ${testFilePath}`);
    console.log(`📦 使用解析器: ${parserType}`);
    console.log("=".repeat(50));
    
    try {
        const content = readFileSync(testFilePath, 'utf-8');
        const lines = content.split('\n');
        
        let testCount = 0;
        let passCount = 0;
        let failCount = 0;
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // 跳过空行和注释
            if (trimmedLine === '' || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
                if (trimmedLine.startsWith('#')) {
                    console.log(`\n📝 ${trimmedLine}`);
                }
                continue;
            }
            
            // 处理行内注释
            const expression = trimmedLine.split('#')[0]?.trim() || '';
            if (expression === '') {
                continue;
            }
            
            // 运行测试用例
            testCount++;
            console.log(`\n🔍 测试 ${testCount}: ${expression}`);
            
            try {
                const result = runParserSync(expression, parserType);
                console.log(`✅ 通过 - 结果: ${result}`);
                passCount++;
                
            } catch (error) {
                console.log(`❌ 失败 - 错误: ${error}`);
                failCount++;
            }
        }
        
        console.log("\n" + "=".repeat(50));
        console.log(`📊 测试总结:`);
        console.log(`   总测试数: ${testCount}`);
        console.log(`   通过: ${passCount} ✅`);
        console.log(`   失败: ${failCount} ❌`);
        console.log(`   成功率: ${((passCount / testCount) * 100).toFixed(1)}%`);
        
    } catch (error) {
        console.error(`❌ 读取测试文件失败: ${error}`);
    }
}

// --- 同步运行解析器 ---
function runParserSync(expression: string, parserType: string): string {
    let parserCommand = '';
    
    switch (parserType) {
        case 'bnf-integrated':
            parserCommand = 'bun run bnf/index.ts';
            break;
        case 'bnf-separated':
            parserCommand = 'bun run bnf/separated.ts';
            break;
        case 'precedence-integrated':
            parserCommand = 'bun run precedence-climbing/index.ts';
            break;
        case 'precedence-separated':
            parserCommand = 'bun run precedence-climbing/separated.ts';
            break;
        // 保持向后兼容
        case 'start':
            parserCommand = 'bun run bnf/index.ts';
            break;
        case 'separated':
            parserCommand = 'bun run bnf/separated.ts';
            break;
        case 'precedence':
            parserCommand = 'bun run precedence-climbing/index.ts';
            break;
        default:
            parserCommand = 'bun run bnf/separated.ts';
    }
    
    try {
        // 使用echo和管道来发送输入
        const command = `echo "${expression}" | ${parserCommand}`;
        const output = execSync(command, { 
            encoding: 'utf-8',
            timeout: 5000 // 5秒超时
        });
        
        // 从输出中提取结果
        const lines = output.split('\n');
        let result = '';
        
        for (const line of lines) {
            // 查找包含数字的行
            if (line.match(/^\d+$/) || line.match(/^-\d+$/)) {
                result = line.trim();
                break;
            }
            // 查找包含"计算结果"的行
            if (line.includes('计算结果') || line.includes('Evaluate result')) {
                const match = line.match(/(\d+)/);
                if (match && match[1]) {
                    result = match[1];
                    break;
                }
            }
        }
        
        if (result) {
            return result;
        } else {
            throw new Error('无法从输出中提取结果');
        }
        
    } catch (error) {
        throw new Error(`解析器执行失败: ${error}`);
    }
}

// --- 主程序 ---
function main(): void {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log("使用方法: bun run runner.ts <测试文件路径> [解析器类型]");
        console.log("示例: bun run runner.ts test/basic-expressions.txt bnf-separated");
        console.log("解析器类型:");
        console.log("  BNF方法: bnf-integrated, bnf-separated");
        console.log("  优先级爬升: precedence-integrated, precedence-separated");
        console.log("  向后兼容: start, separated, precedence, precedence-separated");
        process.exit(1);
    }
    
    const testFilePath = args[0] || '';
    const parserType = args[1] || 'separated';
    
    runTestFile(testFilePath, parserType);
}

// 运行主程序
main();
