"""Local singing/speech transcription. JSON lines on stdout are consumed by server.js."""
import json
import math
import os
import re
import sys
from pathlib import Path


def emit(kind, **data):
    print(json.dumps(dict(type=kind, **data), ensure_ascii=False), flush=True)


def main():
    audio_path, model_name, language, cache = sys.argv[1:]
    emit('progress', message='正在读取音频…', progress=2)
    from faster_whisper import WhisperModel, decode_audio, download_model
    import av

    with av.open(audio_path) as container:
        if not container.streams.audio:
            raise ValueError('文件里没有音轨，请选择可正常播放的音频。')
        if container.duration and container.duration / av.time_base > 1800:
            raise ValueError('首版支持 30 分钟以内的音频，请先截取需要处理的部分。')
    audio = decode_audio(audio_path, sampling_rate=16000)
    duration = len(audio) / 16000
    if duration > 1800:
        raise ValueError('音频超过 30 分钟，请先截取需要处理的部分。')
    if duration < .3:
        raise ValueError('音频太短，无法识别。')
    model_dir = Path(cache) / model_name
    if not all((model_dir / f).exists() for f in ['model.bin', 'config.json', 'tokenizer.json', 'vocabulary.txt']):
        emit('progress', message=f'首次使用 {model_name} 模型，正在联网下载。音频不会上传；下载完成后可离线识别。', progress=4)
        download_model(model_name, output_dir=str(model_dir))
    emit('progress', message='正在加载本地模型…', progress=8)
    model = WhisperModel(str(model_dir), device='cpu', compute_type='int8', cpu_threads=min(8, os.cpu_count() or 4))
    segments, info = model.transcribe(
        audio, language=None if language == 'auto' else language,
        beam_size=5, word_timestamps=True, vad_filter=False,
        condition_on_previous_text=False, no_speech_threshold=.6,
        hallucination_silence_threshold=2.0,
        initial_prompt='以下是歌曲的歌词。' if language == 'zh' else None,
    )
    rows = []
    for segment in segments:
        if segment.no_speech_prob > .7 and segment.avg_logprob < -.6:
            continue
        words = segment.words or []
        uncertain = segment.avg_logprob < -.8
        if not words:
            if segment.text.strip():
                rows.append({'time':round(segment.start,2),'end':round(segment.end,2),'text':segment.text.strip(),'review':uncertain})
        else:
            group=[]
            for i, word in enumerate(words):
                group.append(word)
                text=''.join(w.word for w in group).strip()
                boundary = bool(re.search(r'[。！？!?；;，,]$', word.word.strip()))
                gap = i+1 < len(words) and words[i+1].start-word.end > .7
                if boundary or gap or len(text) >= (22 if info.language in ['zh','ja'] else 60) or i == len(words)-1:
                    if text:
                        rows.append({'time':round(group[0].start,2),'end':round(group[-1].end,2),'text':text,'review':uncertain or any(w.probability < .45 for w in group)})
                    group=[]
        progress=min(96,10+int(segment.end/duration*85))
        emit('progress',message=f'正在听写 {int(segment.end)//60:02d}:{int(segment.end)%60:02d} / {int(duration)//60:02d}:{int(duration)%60:02d} · 已生成 {len(rows)} 行',progress=progress)
    rows=[r for r in rows if math.isfinite(r['time']) and r['time'] >= 0 and r['time'] <= duration]
    emit('result',rows=rows,language=info.language,duration=duration)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        import traceback
        traceback.print_exc(file=sys.stderr)
        message=str(exc)
        if isinstance(exc, ImportError):
            message='识别依赖尚未安装完整，请运行 install.cmd 后重试。'
        elif any(s in message.lower() for s in ['huggingface','connection','timed out','offline','resolve','network']):
            message='模型下载失败，请检查网络后重试。已有模型可以离线使用；也可以先粘贴歌词手动打轴。'
        emit('error',message=message[:600])
        sys.exit(1)
