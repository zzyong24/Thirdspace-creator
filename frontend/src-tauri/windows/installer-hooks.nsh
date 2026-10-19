; T-487 — Windows 安装期物化 sidecar。
;
; Tauri 官方模板会在 NSIS_HOOK_POSTINSTALL 之前把主程序和 sidecar.tar.gz 写入
; $INSTDIR。这里复用主程序内置的 Rust tar/SHA 校验器，不依赖用户电脑另装
; PowerShell、OpenSSL、7-Zip 或 tar。先在用户选择的 $INSTDIR 物化，
; 启动时沿既有包级 appDataDir 迁移/选择逻辑消费已验证 runtime。

!macro NSIS_HOOK_PREINSTALL
  ; 只清理可再生的未完成暂存区；已切换成功的 current runtime 不动。
  RMDir /r "$INSTDIR\runtime-images\.staging"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "正在准备 CreatorOS 离线运行环境（首次启动无需再次解压）…"
  ; 使用 NSIS 原生同步等待，避免 nsExec 对 stdout/stderr 和静默超时的插件语义把
  ; 正常的大包 SHA/解压误判成 timeout。真实失败由 Rust 落盘诊断文件供 CI/用户日志读取。
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --creatoros-install-runtime' $0
  ${If} $0 != 0
    RMDir /r "$INSTDIR\runtime-images\.staging"
    ; POSTINSTALL 时官方模板已经写完 exe/注册表/快捷方式，Abort 不能事务回滚。
    ; 因此诚实 fail-forward：保留已校验来源 sidecar.tar.gz，让首次启动走 Rust
    ; appData 兼容解压；原生 workflow 会把任何此类降级拦在上传产物之前。
    DetailPrint "安装期展开失败（错误码 $0），已保留离线资源，首次启动将自动修复。"
  ${Else}
    ; release首启签名门及主页后BLAKE3持续读取原tar与.sig，成功也必须保留。
    ; 原归档常驻约873MB；不为节省磁盘降低完整性守卫。
    DetailPrint "CreatorOS 离线运行环境准备完成。"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; [T-557] runtime 内含深层 node_modules，NSIS RMDir /r 会受 MAX_PATH 限制而残留。
  ; 主动卸载时趁主程序仍存在，先由 Rust 的长路径文件 API 递归清理。
  ; updater 的 /UPDATE 必须保留 current runtime，供新版本安装期原子替换。
  ${If} $UpdateMode <> 1
    DetailPrint "正在清理 CreatorOS 离线运行环境…"
    ; 深层 node_modules 清理同样使用原生同步等待，不依赖输出刷新超时。
    ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --creatoros-uninstall-runtime' $0
    ${If} $0 != 0
      DetailPrint "离线运行环境清理失败（错误码 $0），将继续执行卸载器兜底清理。"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; runtime-images 是安装包可再生资源，不包含数据库、授权、模型密钥或用户日志。
  ; 用户数据仍位于 Tauri appDataDir，由官方卸载器的“删除应用数据”选项单独控制。
  ; 官方 updater 会以 /UPDATE 运行卸载段，此时保留 current，供新版本安装期原子替换；
  ; 只有用户主动卸载才删除。
  ${If} $UpdateMode <> 1
    RMDir /r "$INSTDIR\runtime-images"
    ; 官方模板在本 hook 之前已尝试 RMDir $INSTDIR，当时 runtime-images 仍在所以不会空；
    ; 删除 runtime 后再补一次，避免主动卸载残留空安装目录。
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
