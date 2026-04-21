# Kingdom Wars — Browser RTS Prototype

브라우저에서 바로 실행할 수 있는 중세 유럽(영국/프랑스/독일) 2D RTS 프로토타입입니다. Tiny Swords 에셋 기반.

## 실행 방법

가장 안전한 방법:

```bash
cd three-kingdoms-rts
node server.mjs
```

이후 브라우저에서 `http://localhost:8000` 을 엽니다.

더 쉬운 방법:

- `run-local.bat` 을 더블클릭하면 로컬 서버와 브라우저가 자동으로 열립니다.
- 또는 `npx http-server -p 8080` 같은 정적 파일 서버도 동작합니다.

직접 열기:

- `index.html` 을 브라우저로 열어도 됩니다. (단, ES Module 정책 때문에 `file://` 은 실패할 수 있음)
- `Phaser` 는 프로젝트 내부의 ES Module 번들을 사용합니다.
- 인터넷 연결 없이도 실행할 수 있습니다.

## 조작

- 좌클릭: 유닛 또는 건물 선택
- 드래그 좌클릭: 다중 선택
- 우클릭: 이동 명령 (적/자원 우클릭은 자동으로 공격/수확)
- `Q`: 선택된 영웅의 특수 능력 사용
- `WASD` 또는 방향키: 카메라 이동
- 마우스 휠: 줌 인/아웃
- 미니맵 클릭: 카메라 이동

## 세력

3개 세력이 120° 대칭 맵에서 동시에 플레이:

| 세력 | 영웅 | 특성 | 패시브 |
|------|------|------|--------|
| **England** | Lionheart | 건설비 저렴, archer 사거리 보너스 | Longbow Doctrine — archer가 3명 이상 뭉치면 사거리 +10% |
| **France** | Roland | 영웅 스탯 강화, 생산 속도 빠름 | Chivalry — 영웅 주변 infantry 데미지 +8% |
| **Germany** | Kaiser | 건물 HP 강화, lancer 강화 | Teutonic Discipline — 3명 이상 뭉친 유닛 방어력 +1 |

## 유닛 (7종, 모든 세력 공유)

- **Peasant** — 자원 수집 + 건설
- **Militia** — 빠른 정찰 (저렴, 약함)
- **Bulwark** — 탱크 (고 HP + 높은 방어력)
- **Warrior** — 균형형 근접
- **Lancer** — 중장보병 (긴 사거리, 높은 HP)
- **Archer** — 원거리 주력
- **Monk** — 지원/치유

## 건물

- **Castle** (Town Center) — Peasant/Militia/Bulwark 생산, 자원 저장
- **House** — 인구 확장
- **Barracks** — Warrior/Lancer 생산
- **Archery Range** — Archer 생산
- **Monastery** — Monk 생산

## 현재 구현된 기능

- 시작 화면, 세력 선택, 승리/패배 화면, 재시작
- 3세력 동시 플레이 (정치: 어부지리/밸런스 — 두 AI가 강자를 먼저 공격)
- 식량, 금 자원 시스템 + 인구(supply)
- A* 경로탐색 + Flocking(separation/alignment/cohesion)
- 지형 — 강, 다리, 숲, 덤불, 절벽 (각자 이동/시야 영향)
- 17개 AI 전략 행동 (focus fire, kiting, flanking, scouting, harassment 등)
- 자동 전투, 데미지, 사망, 건물 파괴
- 생산 버튼, 선택 정보 UI, 미니맵, 커스텀 커서

## 설계 메모

- 3세력은 같은 유닛/건물을 공유. 세력 특성은 스탯 보너스와 패시브로 차별화.
- 저장/불러오기, 캠페인, 외교, 멀티플레이, 사기/진형/화공, 기술 트리는 미구현.

## 파일 구조

```text
three-kingdoms-rts/
├─ index.html
├─ style.css
├─ package.json
├─ src/
│  ├─ main.js
│  ├─ phaser.js
│  ├─ scenes/
│  │  ├─ BootScene.js
│  │  └─ GameScene.js
│  ├─ entities/
│  │  ├─ Unit.js
│  │  ├─ Hero.js
│  │  └─ Building.js
│  ├─ systems/
│  │  ├─ SelectionSystem.js
│  │  ├─ CombatSystem.js
│  │  ├─ ResourceSystem.js
│  │  ├─ ProductionSystem.js
│  │  ├─ FlockingSystem.js
│  │  ├─ Pathfinding.js
│  │  ├─ TerrainMap.js
│  │  ├─ MinimapSystem.js
│  │  ├─ AIController.js
│  │  └─ AIProfiles.js
│  ├─ vendor/
│  │  └─ phaser.esm.js
│  └─ data/
│     ├─ factions.js
│     ├─ units.js
│     └─ heroes.js
├─ assets/tiny-swords/
└─ README.md
```
