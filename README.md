# 听歌校词 · Lyric Studio

一个在 Windows 本机运行的歌词工作台：**导入 M4A → 自动听写 → 逐句校对 → 重复副歌同步修改 → 导出 LRC**。

Local lyric transcription and editing, with linked edits for repeated choruses and timestamped LRC export.

音频在本机处理，无需账号或 API 密钥。模型首次使用需要联网下载，下载完成后可离线识别。项目面向本地音乐歌词制作，Windows QQ 音乐的具体加载行为仍需按客户端版本验证。

## 功能

- **自动听写**：使用 faster-whisper，支持中文、英语、日语、韩语及自动语言检测；提供 Small、Base、Tiny 模型。
- **听歌校对**：音频波形、播放进度、速度调整、前后跳转五秒、选中句循环试听。
- **歌词编辑**：改字、拆句、合并、删除、撤销、手动打点、整首歌词提前或延后。
- **重复歌词联动**：选择重复句建立联动组，之后修改任一句，整组文字同步，每句时间点独立保留。
- **导入与导出**：粘贴文本，导入 UTF-8 / GB18030 LRC，导出 UTF-8 BOM、CRLF 的逐句 LRC。
- **草稿与工程**：浏览器自动保存歌词草稿，也可保存 JSON 工程（包含联动关系）。音频单独保留。

支持 M4A、MP3、WAV、FLAC、AAC、OGG 和带音轨 MP4。单文件最大 120 MB，自动识别最长 30 分钟。

## Windows 快速开始

需要 [Node.js 22 或更新版本](https://nodejs.org/) 和 [Python 3.12](https://www.python.org/downloads/)。安装时将它们加入 PATH。本项目在 Windows、Python 3.12 环境验证过本地识别。

1. 从仓库页面选择 **Code → Download ZIP** 并解压，或使用 Git 克隆本仓库。
2. 双击 `install.cmd`，在项目目录建立独立 Python 环境并安装识别依赖。
3. 双击 `start.cmd`，浏览器将打开 **http://127.0.0.1:3218**。保持启动窗口运行。
4. 导入一首歌，选择语言和模型，点击“自动生成歌词”。首次使用所选模型时会下载模型文件。
5. 复听并校对歌词，点击“导出 LRC”。文件默认与原歌曲同名。
6. 使用结束后，在启动窗口按 `Ctrl+C` 停止服务。

普通使用不需要运行 `npm install`；Node 服务只使用内置模块。Python 依赖通过 `install.cmd` 安装。仓库不包含 Python 环境、已下载模型或用户音频。

安装脚本使用清华 PyPI 镜像。若该镜像不可用，可在项目目录使用默认 PyPI 源：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

只想体验编辑器时，可以先运行 `start.cmd`，点击“体验操作演示”；未安装 Python 识别依赖时，仍可编辑和导出歌词。演示音频由项目自带脚本合成，首次启动时自动生成，并非商业歌曲录音。

如需直接从文件打开界面，先运行 `node scripts/generate-demo.js`，再用浏览器打开 `public/index.html`。文件模式支持编辑、演示和导出；自动识别需要本地 HTTP 服务。

## 重复副歌一起改

1. 选中一句歌词，点击 **“重复歌词联动”**。
2. 查看候选句及其时间点。文字相同的句子默认勾选（忽略标点、空格、英文大小写）；相似但不同的句子默认不勾选。
3. 勾选要一起改的句子，在上方填写正确歌词，再点击 **“应用并联动”**。
4. 以后修改组内任意一句文字，其他成员同步更新，时间点保持独立。

如果自动识别差异较大，可以勾选“显示全部歌词，手动选择”。功能依据**歌词文本**匹配，不分析旋律；相同旋律的两段主歌可能有不同歌词，请核对后再联动。首次应用会将所选句整句替换为上方文字。

- **解除本句联动**：将某一遍副歌单独拿出来修改，其余成员继续联动。
- **撤销**：一次恢复整组编辑。
- **保存**：浏览器草稿和 JSON 工程保留联动关系；LRC 只保存歌词和时间点。
- **拆句、合并**：自动解除涉及行的联动，避免结构变化后继续覆盖其他段落。
- **重新识别或导入 LRC**：建立新的歌词列表，需要重新选择联动关系。

操作演示的第 1、3、5 行为相同或近似歌词，第 5 行故意保留错字，可以用来体验该功能。

## 快捷键

在没有编辑文本、也没有打开弹窗时：

| 按键 | 操作 |
| --- | --- |
| 空格 | 播放 / 暂停 |
| `T` | 将当前播放时间标给选中句，并选中下一句 |
| `Ctrl+Z` | 撤销编辑 |

## Windows QQ 音乐

将 `歌曲.m4a` 与导出的 `歌曲.lrc` 放在一起。如果你的 QQ 音乐版本提供“关联本地歌词”或“选择本地歌词”，可从该入口选择 LRC。

本项目输出标准逐句 LRC，不会写入 QQ 音乐云端，也没有生成专有 QRC 或 M4A 内嵌歌词。**尚未完成 QQ 音乐客户端兼容实测**，不能保证所有版本自动加载同名 LRC。本项目与腾讯或 QQ 音乐没有官方关联。

## 本地数据与运行方式

前端为原生 HTML/CSS/JavaScript，Node.js 提供本地 HTTP 接口，Python 子进程运行 CPU INT8 识别。服务仅监听 `127.0.0.1`。

| 路径 | 用途 |
| --- | --- |
| `public/` | 页面与歌词编辑器 |
| `server.js` | 本地 HTTP 服务 |
| `transcribe.py` | 音频解码与识别工作进程 |
| `scripts/generate-demo.js` | 合成演示伴奏 |
| `tests/` | 歌词、联动、DOM 事件与接口测试 |
| `.venv/` | 本地 Python 环境，不提交到仓库 |
| `.runtime/models/` | 下载的模型，不提交到仓库 |
| `.runtime/jobs/` | 识别期间的临时音频副本 |
| `.runtime/last-error.log` | 最近一次失败的诊断日志 |

原始音频保持不变。临时副本在任务完成、失败或取消后删除；异常断电可能留下临时文件，可在关闭服务后清理 `.runtime/jobs/`。歌词草稿保存在浏览器中；刷新页面后重新选择同一音频即可继续。

如需修改 Python 或模型缓存的位置，可复制 `config.example.json` 为 `config.local.json` 并修改路径。默认配置已适合 Windows 安装流程，不必额外创建配置文件。

Small 模型约 484 MB，Base 约 145 MB。迁移到另一台电脑时，可保留下载的模型，但应重新运行 `install.cmd` 建立 Python 环境。

## 开发与测试

```powershell
npm ci
npm run check
npm test
```

当前包含 21 项自动测试，覆盖歌词时间格式、LRC 往返、重复句匹配、联动修改、时间保留、撤销、解除联动、工程校验、DOM 事件、静态资源和接口访问限制。GitHub Actions 配置会在 Windows 和 Ubuntu 上运行这些测试，不下载识别模型。

另外已在 Windows 上使用 M4A 格式的合成英语语音验证过 Small 模型识别、时间戳输出、LRC 导出、取消任务和临时音频清理。该验证不代表真实歌曲识别准确率；浏览器视觉检查及 QQ 音乐兼容验证尚未完成。

## 当前限制

识别结果是待校对初稿。伴奏、拖音、和声、同音字可能导致错误，真实歌曲效果需要按目标曲目评估。

目前尚未包含人声分离、改词后自动强制对齐、逐字卡拉 OK 高亮或 GPU 加速。拆句后新增行需要手动打点。

## 许可证与致谢

项目源码采用 [MIT License](LICENSE)。依赖库和下载的模型保留各自许可证，详见 [第三方组件说明](THIRD_PARTY_NOTICES.md)。

核心组件：[faster-whisper](https://github.com/SYSTRAN/faster-whisper)、[Whisper](https://github.com/openai/whisper)、[PyAV](https://github.com/PyAV-Org/PyAV)。
