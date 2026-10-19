# T1195 校准安装启动验收探针

用户既有“有问题的创建task及时修复”及本轮安装后验证授权。T1194首私有探针错误把公开 `creatoros status` 的 `pid` 当作本地服务PID。实际公开返回 `pid=46836`，系统进程是 `/Applications/CreatorOS.app/Contents/MacOS/CreatorOS`，PPID=1；真正服务为直属子进程47036，监听127.0.0.1:57122。原探针15.006404秒exit1、日志SHA `9fc5d67e5d6bacc2f1ae83886d4900bd0ca06c1e35b8310c19436c05f75897f2`，原文件/日志保留。这是我编写验收探针时的协议误解，不是客户端未启动。

修复只在私有验收目录新增 `probe-startup-v2.py`：公开PID必须等于本轮安装启动主PID，真实HTTP监听须来自该主进程的直属子进程；主页面完成只接受HTTP根页面，不把 `tauri://localhost` 的启动页加载事件当作首页。同时核真实运行时stamp等于已核验包SHA。仍走当前用户CLI发现/公开status/access读，不读取连接文件、凭据或数据库；无业务写入/模型调用，不修改产品代码或测试断言，不补拍历史PASS。操作校准不改变产品方向、架构、公共接口或数据归属。

当场修正探针1.257406秒exit0，安装主进程46836、直属服务47036与HTTP首页完成事件真实绑定，stamp匹配23e72d02…；首失败保持原结果。实际收据与校准脚本见 `docs/verification/t1194/REPORT.md`。不以该验证签全功能或原生屏幕眼验。

```mermaid
flowchart LR
 A[公开status主PID] --> B[本轮安装版主进程]
 B --> C[直属服务实际监听端口]
 C --> D[该HTTP首页完成事件]
```
