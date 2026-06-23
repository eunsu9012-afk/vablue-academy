# 베이블루 할리갈리 온라인

Node.js + Express + Socket.IO로 만든 브라우저 접속형 멀티플레이 할리갈리 스타일 MVP입니다. PC 브라우저 기준으로 1~6인 방, 인간 플레이어와 AI 조합, 일반/하드 모드, 방/대기실, 비밀번호방, 감점 배수, 턴 시간 선택, 점수제 생존 게임, JSON 파일 전적 저장, BGM 순차 반복 재생을 지원합니다.

## 설치 및 실행

```bash
npm install
npm start
```

접속 주소:

```text
http://localhost:3000
```

서버는 처음 실행할 때 프로젝트 루트에 `userdata.json`이 없으면 자동으로 생성합니다. `userdata.json`에는 인간 플레이어의 승/패/승률만 저장되며, AI 전적은 저장하지 않습니다.

## 에셋 파일 복사

이 프로젝트에는 지정된 원본 에셋을 아래 경로로 복사해서 사용할 수 있습니다. 현재 작업본에는 원본 위치에 파일이 있어 명세서의 이름으로 복사해 두었습니다.

이미지 원본 위치:

```text
D:\Downloads\작품활동\이미지
```

복사 대상:

```text
설홍 일러.png   -> public/assets/characters/seolhong.png
여우연 일러.png -> public/assets/characters/yeowooyeon.png
최애리 일러.png -> public/assets/characters/choiaeri.png
눈요 일러.png   -> public/assets/characters/nunyo.png
나노 일러.png   -> public/assets/characters/nano.png
루첼 일러.png   -> public/assets/characters/ruchel.png
뒷면 카드.png   -> public/assets/cards/back.png
베이블루 종.png  -> public/assets/bell/bell.png
```

BGM 원본 위치:

```text
D:\Downloads\작품활동\음악
```

복사 대상:

```text
할리갈리 bgm1.mp3 -> public/assets/sounds/bgm1.mp3
할리갈리 bgm2.mp3 -> public/assets/sounds/bgm2.mp3
할리갈리 bgm3.mp3 -> public/assets/sounds/bgm3.mp3
할리갈리 bgm4.mp3 -> public/assets/sounds/bgm4.mp3
승리 효과음.mp3     -> public/assets/sounds/victory.mp3
종소리.mp3          -> public/assets/sounds/bell.mp3
```

캐릭터 일러스트를 교체하려면 같은 원본 위치의 `설홍 일러.png`, `여우연 일러.png`, `최애리 일러.png`, `눈요 일러.png`, `나노 일러.png`, `루첼 일러.png`를 위 대상 파일명으로 다시 복사하면 됩니다.

이미지 파일이 없어도 카드 안에는 이름 텍스트 없는 원형 placeholder가 표시됩니다. 카드 뒷면 파일이 없어도 무늬 fallback 카드가 보입니다. 종 이미지가 없으면 CSS fallback 종이 표시됩니다. BGM, 승리 효과음, 종소리 파일이 없으면 재생 오류를 삼키고 무음으로 계속 실행됩니다.

## 기본 조작

- 현재 턴인 인간 플레이어가 자신의 덱을 클릭하면 카드가 1장 공개됩니다.
- 스페이스바 또는 중앙 종 버튼으로 종을 칩니다.
- 숫자패드 1~5로 이모티콘을 보냅니다.
- 우측 상단 톱니바퀴 메뉴에서 BGM 볼륨과 효과음 볼륨을 각각 0~100으로 조절하고, 닉네임을 하루 1회 변경할 수 있습니다.
- 대기실의 `방 만들기` 버튼을 누르면 중앙 모달에서 방 옵션을 선택합니다.
- 현재 접속 유저 목록은 게임방 목록 우측 패널에 항상 표시되며, 닉네임을 우클릭하면 상태 확인, 같이하기, 숨기기를 사용할 수 있습니다.

## 주요 규칙 구현

- 카드 생성, 턴, 점수, 종 최초 입력자, 정답 판정은 서버가 관리합니다.
- 카드 앞면은 이미지 완성본이 아니라 HTML/CSS DOM으로 동적 렌더링합니다.
- 방은 1명만 있어도 만들 수 있고, 최대 인원은 2~6명 중 선택합니다. 게임 시작은 인간+AI 총 2명 이상부터 가능합니다.
- 모든 인간 플레이어가 준비 완료되면 게임 시작 상태를 보호하기 위해 AI 추가가 비활성화됩니다.
- 일반 모드는 한 카드에 한 캐릭터만 1~5개 등장합니다.
- 하드 모드는 single 70%, double 20%, triple 10% 비율로 2명/3명 혼합 카드가 등장합니다.
- 공개 카드 판정은 각 플레이어의 공개 더미 최상단 카드 counts를 합산합니다.
- 방 생성 시 감점 배수 1배/2배/3배와 턴 시간 6초/8초/10초를 선택할 수 있습니다.
- 정답이면 종 친 플레이어를 제외한 생존 플레이어가 각자 공개 더미 장수 x 5점 x 감점 배수만큼 감점됩니다.
- 오답이면 종 친 플레이어가 생존 플레이어 수 x 5점 x 감점 배수만큼 감점됩니다.
- 선택한 턴 제한 시간이 지나면 시간초과 플레이어가 생존 플레이어 수 x 5점 x 감점 배수만큼 감점되고 공개 카드가 폐기됩니다.
- 0점 이하 플레이어는 관전자 모드로 전환됩니다.
- AI가 한 명이라도 포함된 게임은 승/패/승률 전적에 반영하지 않습니다.
- AI 없는 게임에서 인간 플레이어가 게임 중 나가면 패배 1회가 기록됩니다.
- 인간 플레이어가 모두 나가 AI만 남으면 게임을 종료하고 방을 삭제합니다.
- 게임 중 나가거나 연결이 끊기면 해당 인간 플레이어는 즉시 방에서 제거됩니다.
- 예약 닉네임 `눈요`, `설홍`, `루첼`, `나노`, `최애리`, `여우연`은 직접 사용할 수 없습니다.
- `va눈요`, `va설홍`, `va루첼`, `va나노`, `va최애리`, `va여우연`은 내부 닉네임으로 저장하되 화면에는 예약 닉네임만 굵은 파란색으로 표시합니다.

## 브라우저 BGM 자동재생 정책

대부분의 브라우저는 사용자의 클릭 전 자동재생을 막습니다. 이 프로젝트는 로비 진입 후 첫 클릭이 발생하면 `bgm1 -> bgm2 -> bgm3 -> bgm4 -> bgm1` 순서로 반복 재생을 시작합니다. BGM 볼륨은 `localStorage`의 `bgmVolume`, 효과음 볼륨은 `sfxVolume`에 저장됩니다.

## Render 배포 요약

1. GitHub 저장소에 프로젝트를 올립니다.
2. Render에서 New Web Service를 생성하고 저장소를 연결합니다.
3. Build Command는 `npm install`, Start Command는 `npm start`로 설정합니다.
4. 무료 인스턴스는 재시작 시 로컬 `userdata.json`이 초기화될 수 있으므로, 장기 운영에는 영속 디스크나 외부 DB를 고려하세요.

## Railway 배포 요약

1. Railway에서 새 프로젝트를 만들고 GitHub 저장소를 연결합니다.
2. Install/Start는 `npm install`, `npm start`를 사용합니다.
3. Railway 환경의 포트는 `PORT` 환경변수로 주입되며 서버가 자동 사용합니다.
4. `userdata.json`을 장기 저장용으로 쓰려면 볼륨 설정 또는 별도 DB 구성을 검토하세요.

## 문제 해결

- `npm install` 중 오류가 나면 Node.js 24.16.0 이상인지 확인하세요.
- `http://localhost:3000` 접속이 안 되면 서버 콘솔에 표시된 포트와 방화벽 상태를 확인하세요.
- 같은 닉네임으로 입장할 수 없으면 기존 브라우저 탭이 아직 접속 중인지 확인하세요.
- BGM이 바로 안 들리면 화면을 한 번 클릭하세요.
- 이미지가 안 보이면 위 에셋 복사 경로와 파일명을 확인하세요.
## 추가 BGM 트랙과 모드

새 잔잔한 BGM은 아래 이름으로 복사하면 됩니다.

```text
D:\Downloads\작품활동\음악\할리갈리 track1.mp3 -> public/assets/sounds/track1.mp3
D:\Downloads\작품활동\음악\할리갈리 track2.mp3 -> public/assets/sounds/track2.mp3
D:\Downloads\작품활동\음악\할리갈리 track3.mp3 -> public/assets/sounds/track3.mp3
```

우측 상단 설정 메뉴의 `BGM 모드`에서 `전부`, `경쾌`, `잔잔`을 선택할 수 있습니다. 선택값은 `localStorage`의 `bgmMode`에 `all`, `energetic`, `calm` 값으로 저장됩니다.

## PC 조작법 이미지 에셋

PC 인게임 상단 메뉴 왼쪽에 표시되는 조작법 이미지는 아래 경로로 복사해서 사용합니다.

```text
D:\Downloads\작품활동\이미지\'조작법1'.png -> public/assets/tutorial/controls1.png
D:\Downloads\작품활동\이미지\'조작법2'.png -> public/assets/tutorial/controls2.png
```
