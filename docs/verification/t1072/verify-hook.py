#!/usr/bin/env python3
"""在中性 Git 仓库验证全局提交钩子的分发边界；工具夹具不代签 Lefthook。"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


def run(argv, cwd, env):
    return subprocess.run(argv, cwd=cwd, env=env, text=True,
                          capture_output=True, timeout=125)


def verify(hook, report_path=None):
    base = Path(tempfile.mkdtemp(prefix="t1072-hook-verify-"))
    hooks = base / "hooks"
    hooks.mkdir()
    shutil.copyfile(hook, hooks / "commit-msg")
    (hooks / "commit-msg").chmod(0o755)
    bins = base / "controlled-path"
    bins.mkdir()
    for name in ("git", "uname", "tr", "sed"):
        target = shutil.which(name)
        assert target, name
        (bins / name).symlink_to(target)
    template = base / "empty-git-template"
    template.mkdir()
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("GIT_", "LEFTHOOK"))}
    env.update(PATH=str(bins), GIT_CONFIG_GLOBAL=os.devnull,
               GIT_CONFIG_NOSYSTEM="1", GIT_TEMPLATE_DIR=str(template))
    results = []
    git = str(bins / "git")

    def setup(name, config=None, tool=None, extras=None):
        repo = base / name
        repo.mkdir()
        e = dict(env)
        e["HOOK_RECORD"] = str(repo / "tool-argv.txt")
        e.update(extras or {})
        assert run([git, "init", "-q"], repo, e).returncode == 0
        if config:
            f = repo / config
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text("{}\n")
        if tool:
            f = repo / "node_modules/.bin/lefthook"
            f.parent.mkdir(parents=True)
            f.write_text('#!/bin/sh\nprintf \'%s\\n\' "$@" > "$HOOK_RECORD"\n'
                         'exit "${HOOK_RC:-0}"\n')
            f.chmod(0o755)
            if tool == "path":
                own_path = repo / "tool path"
                own_path.mkdir()
                (own_path / "lefthook").symlink_to(f)
                e["PATH"] = str(own_path) + os.pathsep + str(bins)
                f = repo / "tool with spaces"
                shutil.copyfile(repo / "node_modules/.bin/lefthook", f)
                f.chmod(0o755)
                (repo / "node_modules/.bin/lefthook").unlink()
                (own_path / "lefthook").unlink()
                (own_path / "lefthook").symlink_to(f)
        (repo / "sample.txt").write_text("中性钩子验收\n")
        assert run([git, "add", "sample.txt"], repo, e).returncode == 0
        return repo, e

    def commit(repo, e):
        return run([git, "-c", "core.hooksPath=" + str(hooks),
                    "-c", "user.name=钩子验收", "-c", "user.email=hook-test@example.invalid",
                    "commit", "-qm", "中性钩子验收"], repo, e)

    def case(name, operation):
        start = time.monotonic()
        try:
            details = operation()
            result = dict(name=name, passed=True, details=details)
        except (AssertionError, OSError, subprocess.SubprocessError) as err:
            result = dict(name=name, passed=False, error=str(err))
        result["elapsedMs"] = round((time.monotonic() - start) * 1000, 2)
        results.append(result)
        print(("PASS " if result["passed"] else "FAIL ") + name,
              result.get("error", ""))

    def no_config(tool=None):
        repo, e = setup("no config " + str(tool), tool=tool)
        c = commit(repo, e)
        assert c.returncode == 0, c.stderr
        assert not (repo / "tool-argv.txt").exists(), "未配置仓库误调用了工具"
        assert "lefthook" not in (c.stdout + c.stderr).lower(), c.stdout + c.stderr
        return {"gitExit": c.returncode, "toolCalled": False}

    case("未配置且工具缺失的真实Git提交", no_config)
    case("未配置但PATH存在工具时不误调用", lambda: no_config("path"))

    def configured(config, label):
        repo, e = setup(label, config, "local")
        c = commit(repo, e)
        assert c.returncode == 0, c.stderr
        args = (repo / "tool-argv.txt").read_text().splitlines()
        assert args[0] == "run" and "commit-msg" in args, args
        message = Path(args[-1])
        if not message.is_absolute():
            message = repo / message
        assert message.name == "COMMIT_EDITMSG" and message.read_text().strip() == "中性钩子验收"
        return {"gitExit": c.returncode, "toolArgs": args}

    for stem in ("lefthook", ".lefthook", ".config/lefthook",
                 "lefthook-local", ".lefthook-local", ".config/lefthook-local"):
        for extension in ("yml", "yaml", "toml", "json", "jsonc"):
            config = stem + "." + extension
            label = "config " + config.replace("/", "_")
            case("配置发现 " + config, lambda c=config, n=label: configured(c, n))

    def missing_tool():
        repo, e = setup("configured missing tool", "lefthook.yml")
        direct = run(["/bin/sh", str(hooks / "commit-msg"), "message with spaces"], repo, e)
        assert direct.returncode != 0, "配置存在但工具缺失被误报成功"
        c = commit(repo, e)
        assert c.returncode != 0, "Git错误接受了未执行的检查"
        assert run([git, "rev-parse", "--verify", "HEAD"], repo, e).returncode != 0
        return {"hookExit": direct.returncode, "gitExit": c.returncode}

    case("已配置工具缺失阻止提交", missing_tool)

    def failure():
        repo, e = setup("checker failure", "lefthook.yml", "local", {"HOOK_RC": "23"})
        direct = run(["/bin/sh", str(hooks / "commit-msg"), "message with spaces"], repo, e)
        assert direct.returncode == 23, f"退出码改变: {direct.returncode}"
        assert (repo / "tool-argv.txt").read_text().splitlines()[-1] == "message with spaces"
        c = commit(repo, e)
        assert c.returncode != 0, "失败检查未阻止Git提交"
        assert run([git, "rev-parse", "--verify", "HEAD"], repo, e).returncode != 0
        return {"hookExit": direct.returncode, "gitExit": c.returncode}

    case("检查失败原退出码及空格参数保真", failure)

    def explicit_config():
        repo, e = setup("explicit config", tool="path")
        f = base / "external config with spaces.yaml"
        f.write_text("{}\n")
        e["LEFTHOOK_CONFIG"] = str(f)
        e["LEFTHOOK_BIN"] = str(repo / "tool with spaces")
        c = commit(repo, e)
        assert c.returncode == 0, c.stderr
        assert (repo / "tool-argv.txt").exists(), "显式配置没有分发"
        return {"gitExit": c.returncode, "toolCalled": True}

    case("显式配置与含空格的工具路径", explicit_config)

    def path_tool():
        repo, e = setup("configured PATH tool", "lefthook.yml", "path")
        c = commit(repo, e)
        assert c.returncode == 0 and (repo / "tool-argv.txt").exists(), c.stderr
        return {"gitExit": c.returncode}

    case("已配置仓库从PATH解析工具", path_tool)

    def explicit_skip():
        repo, e = setup("explicit skip", "lefthook.yml", "local",
                        {"LEFTHOOK": "0", "HOOK_RC": "23"})
        c = commit(repo, e)
        assert c.returncode == 0 and not (repo / "tool-argv.txt").exists(), c.stderr
        return {"gitExit": c.returncode, "userExplicitSkip": True}

    case("保留用户显式LEFTHOOK=0", explicit_skip)

    def linked_worktree():
        parent, e = setup("parent repo")
        empty = base / "empty-hooks"
        empty.mkdir()
        seed = run([git, "-c", "core.hooksPath=" + str(empty),
                    "-c", "user.name=钩子验收", "-c", "user.email=hook-test@example.invalid",
                    "commit", "-qm", "中性基点"], parent, e)
        assert seed.returncode == 0, seed.stderr
        child = base / "linked worktree with spaces"
        added = run([git, "-c", "core.hooksPath=" + str(empty), "worktree", "add", "-qb",
                     "hook-test", str(child)], parent, e)
        assert added.returncode == 0, added.stderr
        assert (child / ".git").is_file()
        (child / "lefthook-local.json").write_text("{}\n")
        binary = child / "node_modules/.bin/lefthook"
        binary.parent.mkdir(parents=True)
        binary.write_text('#!/bin/sh\nprintf \'%s\\n\' "$@" > "$HOOK_RECORD"\nexit 0\n')
        binary.chmod(0o755)
        e["HOOK_RECORD"] = str(child / "tool-argv.txt")
        (child / "sample.txt").write_text("linked worktree修改\n")
        assert run([git, "add", "sample.txt"], child, e).returncode == 0
        c = commit(child, e)
        assert c.returncode == 0 and (child / "tool-argv.txt").exists(), c.stderr
        return {"gitExit": c.returncode, "gitEntryIsFile": True}

    case("linked worktree真实Git分发", linked_worktree)
    report = {"fixtureBoundary": "真实Git及包装器；Lefthook可执行为可观察夹具，不代签供应商检查。",
              "hook": str(hook), "temporaryRoot": str(base), "passed": sum(x["passed"] for x in results),
              "failed": sum(not x["passed"] for x in results), "results": results}
    if report_path:
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: report[k] for k in ("temporaryRoot", "passed", "failed")}, ensure_ascii=False))
    return bool(report["failed"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hook", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    options = parser.parse_args()
    raise SystemExit(verify(options.hook.resolve(), options.report))
