import { stdin as input, stdout as output } from 'node:process'
import readline from 'node:readline/promises'
import logSymbols from 'log-symbols'

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

export type SelectOption<T> = {
  label: string
  value: T
}

/**
 * 终端数字菜单。返回选中的 value。
 */
export async function promptSelect<T>(title: string, options: SelectOption<T>[]): Promise<T> {
  if (!options.length) {
    throw new Error('无可选项')
  }

  console.log(`\n${logSymbols.info} ${title}`)
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt.label}`)
  })

  while (true) {
    const answer = await promptLine(`请输入序号 [1-${options.length}]: `)
    const n = Number.parseInt(answer, 10)
    if (Number.isFinite(n) && n >= 1 && n <= options.length) {
      return options[n - 1]!.value
    }
    console.log(`${logSymbols.warning} 无效输入，请重新选择`)
  }
}

export async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N'
  while (true) {
    const answer = (await promptLine(`${question} (${hint}): `)).toLowerCase()
    if (!answer) return defaultYes
    if (['y', 'yes', '是'].includes(answer)) return true
    if (['n', 'no', '否'].includes(answer)) return false
    console.log(`${logSymbols.warning} 请输入 y 或 n`)
  }
}
