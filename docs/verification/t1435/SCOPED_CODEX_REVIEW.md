# 分层Codex原生资源分类复核

实际失败：run41503237730 / a640528543fadd49bca4c03816ce7e6e27d01e84。Windows prepared runtime 已实际保持零 node_modules、12815文件并复用两次；最终tar拒绝搬运到 frontend/.next/worker-packages/p0072 下的Codex原生沙箱setup资源。公共guard真实RED复现同一路径误拦。

独立前审、后审：review_ci_signing，无阻塞。旧node_modules规则不变；分层资源必须固定vendor尾路径、pNNNN根，manifest/worker图为普通文件，锁定原生name/version/os/cpu正确，图schema1、节点root/name/version/manifest原字节SHA256、alias数组及execution-worker的准确alias边一致；任何不符继续拒绝。没有修改运行解析器、签名根或安装门，不移除Codex沙箱，不全局放开setup。

六组170测试通过；依赖图22通过，1项Windows专属本机跳过（原生流水线会执行）；timeout-policy/verify.mjs exit0。保留真实RED及本轮失败。下轮仍须以实际签名tar、安装目录、HTTP CSP、主页启动与卸载证明双端交付，不以测试或API绿色代替。
