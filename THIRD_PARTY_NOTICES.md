# Third-party components

Lyric Studio's own source code is distributed under the MIT license in `LICENSE`.
Third-party libraries and downloaded model weights remain subject to their own
licenses; this repository's license does not replace those terms.

The repository does not bundle model weights, Python environments, dependency
directories, user recordings, or exported lyric projects.

## Runtime components

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper): local transcription.
- [CTranslate2](https://github.com/OpenNMT/CTranslate2): inference engine used by faster-whisper.
- [OpenAI Whisper](https://github.com/openai/whisper): underlying speech recognition models.
- [Systran converted Whisper models](https://huggingface.co/Systran): downloaded on first use.
- [PyAV](https://github.com/PyAV-Org/PyAV): audio decoding.
- Other transitive Python dependencies retain their distributed license files.

## Development dependencies

- [jsdom](https://github.com/jsdom/jsdom): DOM event tests without a browser.
- Transitive JavaScript dependencies are recorded in `package-lock.json`.

## Demo assets

`scripts/generate-demo.js` generates an original synthesized accompaniment. The
demo lyric snippets are illustrative text, not an automatic transcription of a
commercial recording. The generator and example text are part of this project's
MIT-licensed source.
