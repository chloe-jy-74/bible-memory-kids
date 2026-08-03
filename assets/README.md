# 성구암송 웹앱 이미지 에셋

## 구성
- `images/` — 512x512 그림 + 하단 한글 라벨 (총 71장 PNG)
- `images.json` — 파일명과 한글 라벨 매핑

## 사용법
프로젝트의 `assets/` 아래에 이 폴더를 통째로 넣고 `images.json`을 읽으면 됩니다.

```js
const assets = await fetch('/assets/images.json').then(r => r.json());
const byLabel = Object.fromEntries(assets.images.map(i => [i.label, i]));
byLabel['독생자']  // undefined — 아래 '주의' 참고
byLabel['사랑']    // { file: "images/love.png", label: "사랑", note: null, category: "추상" }
```

## images.json 필드
| 필드 | 설명 |
|---|---|
| `file` | 이미지 상대 경로 |
| `label` | 그림에 인쇄된 한글 (음성 재생 시 이 문자열을 읽으면 됨) |
| `note` | 추상 개념의 부가 설명. 그림에도 작게 인쇄되어 있음 |
| `category` | 인물 / 도감 / 장소 / 사물 / 자연 / 추상 / 보상 |

## 주의
- 그림에 이미 한글이 인쇄되어 있으므로, 앱 화면에서 라벨을 다시 표시하지 마세요. 중복됩니다.
- 배경이 흰색입니다. 버튼/카드 배경도 흰색으로 맞추세요.
- 문제은행 선택지 중 일부는 대응 이미지가 없습니다 (성경 출처, 월 이름, 구절 일부, 부사 등).
  이 문항들은 글자 + 음성 3지선다로 처리합니다. 기획서 7장 참고.
- `도감` 카테고리 12장은 파일명이 `m01`~`m12`로 월 순서입니다. 정답 보상 연출에도 재사용하세요.
- `보상` 4장의 label은 사물 이름이 아니라 칭찬 문구입니다 (잘했어요 / 최고예요 / 참 잘했어요 / 대단해요).
