/** 仅本地Codex宿主所需的现有供应商环境；不记录、不落库、不覆盖全局配置。 */
export function localCodexWorkerEnv(source:NodeJS.ProcessEnv=process.env):Record<string,string>{
 const result:Record<string,string>={};
 for(const name of ['CODEX_HOME','OPENAI_API_KEY','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR']){
  const value=source[name];if(typeof value==='string')result[name]=value;
 }
 return result;
}
