# 개발·배포 안내

일반 사용자는 설치나 배포 없이 [한번에 얼굴 가리기](https://muhansspark.github.io/face-cover/)를 바로 사용할 수 있습니다. 이 문서는 코드를 수정하거나 자신의 저장소에 배포하려는 사람을 위한 안내입니다.

## 로컬 개발

- 별도 빌드 과정이 없는 정적 웹 앱입니다.
- 시작 파일은 `studio.js`, 스타일은 `style.css`와 `studio.css`입니다.
- Node.js 설치 후 프로젝트 폴더에서 `node server.cjs --open`으로 실행합니다.
- `npm test`로 좌표·크기 계산 검사를 실행합니다.
- 실행 자산을 다시 받으려면 `download-assets.ps1`을 사용합니다(인터넷 필요).
- 앱 파일 수정 후 `sw.js`의 CACHE 버전을 올리세요. 새 버전 설치 후 페이지를 다시 열어야 변경이 반영됩니다.
- 외부 라이브러리의 버전·라이선스·소스 위치는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.

## 자신의 GitHub Pages에 배포하기

1. 이 저장소를 자신의 계정으로 Fork하거나, 앱 파일을 자신의 공개 저장소에 올립니다.
2. `index.html`과 `vendor` 폴더가 저장소 최상위에 있는지 확인합니다. `vendor`의 모델·라이브러리·WASM 파일과 `.nojekyll`도 포함해야 합니다.
3. 저장소의 **Settings → Pages**에서 **Deploy from a branch**를 선택합니다.
4. **main**, **/(root)**를 선택하고 **Save**를 누릅니다.
5. 배포가 완료되면 **Visit site**로 접속합니다.
6. README의 바로 사용하기 링크를 자신의 배포 주소로 바꿉니다.

저장소에는 앱 코드·실행 자산·문서만 올리세요. 사용자의 사진이나 테스트용 개인 사진은 포함하지 않습니다.

[GitHub Pages 공식 배포 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
