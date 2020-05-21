import fs from 'fs'
import path from 'path'
import execa, {command} from 'execa'
import got from 'got'

interface Gem {
  name: string
  groups: string[]
}

interface GemInfo {
  info?: string
  homepage_uri?: string
  authors?: string
}

export type GemWithInfo = Gem & GemInfo

const getGems = async (gemfile: string): Promise<Gem[]> => {
  const parseScript = path.resolve(__dirname, '../parse_gemfile.rb')
  const {stdout} = await command(`ruby ${parseScript} ${gemfile}`)

  return JSON.parse(stdout)
}

const gemInfo = async (gem: Gem): Promise<GemInfo | null> => {
  try {
    const {body} = await got.get<GemInfo>(
      `https://rubygems.org/api/v1/gems/${gem.name}.json`,
      {
        responseType: 'json'
      }
    )
    return body
  } catch (error) {
    return null
  }
}

const mergeGemInfo = async (gem: Gem): Promise<GemWithInfo> => {
  return {
    ...gem,
    ...(await gemInfo(gem))
  }
}

const detectNewGems = async (): Promise<GemWithInfo[]> => {
  const subProcess = execa('git', [
    'show',
    `remotes/origin/${process.env.GITHUB_BASE_REF}:Gemfile`
  ])
  subProcess.stdout?.pipe(fs.createWriteStream('.Gemfile.base'))
  await subProcess

  const gems = await getGems('Gemfile')
  const baseGemNames = (await getGems('.Gemfile.base')).map(({name}) => name)
  const newGems = gems.filter(({name}) => !baseGemNames.includes(name))

  return await Promise.all(newGems.map(mergeGemInfo))
}

export {getGems, mergeGemInfo, detectNewGems}
