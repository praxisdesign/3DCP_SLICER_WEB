# 3DCP Slicer Web 매뉴얼

## 개요

3DCP Slicer Web은 콘크리트 3D 프린팅을 위한 브라우저 기반 슬라이서 프로토타입입니다. 3D 모델을 불러오고, Z-up 좌표계를 기준으로 레이어를 슬라이싱하며, 레이어 경로와 bead를 미리 볼 수 있습니다. 또한 재료량과 출력 시간을 추정하고, 프린터 프로필 설정을 반영한 G-code를 생성할 수 있습니다.

## 로컬 실행 방법

의존성 설치:

```powershell
npm.cmd install
```

로컬 서버 실행:

```powershell
npm.cmd run dev
```

브라우저에서 아래 주소를 엽니다:

```text
http://127.0.0.1:5173/
```

## 지원 파일 형식

- `.obj`
- `.3dm`
- `.step`
- `.stp`

좌측의 `모델 업로드` 영역을 클릭해 컴퓨터에 있는 모델 파일을 불러옵니다.

## 뷰포트

- 장면은 `Z-up` 좌표계를 사용합니다.
- 그리드는 불러온 모델의 최하단에 배치됩니다.
- 모델을 불러오면 카메라가 모델 크기에 맞춰 자동 줌됩니다.
- 마우스로 회전, 이동, 확대/축소할 수 있습니다.
- 좌표계 기즈모는 뷰포트 좌측 하단에 표시됩니다.

## Slice 패널

### Bead Width

콘크리트 bead의 너비를 밀리미터 단위로 설정합니다.

기본값:

```text
60 mm
```

### Bead Height

콘크리트 bead의 높이를 밀리미터 단위로 설정합니다. 현재 버전에서는 이 값이 슬라이싱 레이어 높이와 동일하게 사용됩니다.

기본값:

```text
20 mm
```

### Layer Preview

뷰포트에 표시할 레이어를 선택합니다.

### Play / Pause

레이어 프리뷰를 아래에서 위로 자동 재생하거나 일시정지합니다.

### Speed

레이어 프리뷰 애니메이션 속도를 fps 단위로 조절합니다.

## G-code

### G-code 미리보기

현재 슬라이싱 결과와 프린터 프로필 설정을 기준으로 G-code를 생성하고 화면에서 미리 봅니다. 미리보기 창은 접기/펼치기가 가능하며, 생성 후 `Printer Profile` 패널 위에 표시됩니다.

### G-code 다운로드

생성된 G-code를 `.gcode` 파일로 다운로드합니다.

생성되는 G-code에는 다음 항목이 포함됩니다:

- 밀리미터 단위 설정
- 절대 좌표 방식
- travel move
- print move
- print speed
- travel speed
- pump on 명령
- pump off 명령
- bead width, bead height, flow multiplier를 반영한 extrusion 값

## Printer Profile 패널

### Print Speed

출력 이동의 feed rate를 `mm/min` 단위로 설정합니다.

### Travel Speed

비출력 이동의 feed rate를 `mm/min` 단위로 설정합니다.

### Flow Multiplier

재료 토출량을 배율로 조절합니다.

### Pump On

각 출력 move 전에 삽입되는 pump on 명령입니다.

기본값:

```gcode
M106
```

### Pump Off

각 출력 move 후와 G-code 끝부분에 삽입되는 pump off 명령입니다.

기본값:

```gcode
M107
```

## Preview 패널

### Model

불러온 모델 표시 여부를 켜거나 끕니다.

### Slice Lines

현재 선택된 레이어의 슬라이스 라인 표시 여부를 켜거나 끕니다.

### Beads

bead 프리뷰 표시 여부를 켜거나 끕니다.

### All Beads

전체 레이어의 bead 경로를 한 번에 표시합니다. 성능을 위해 전체 bead 모드는 3D tube geometry 대신 가벼운 line segment 방식으로 표시됩니다.

`All Beads`가 꺼져 있으면 선택된 현재 레이어의 bead만 고품질 3D tube 형태로 표시됩니다.

## 통계 패널

통계 패널에는 다음 정보가 표시됩니다:

- `Layers`: 생성된 슬라이스 레이어 수
- `Segments`: 현재 선택된 레이어의 segment 수
- `Path Length`: 전체 경로 길이
- `Material`: 예상 재료량, 리터 단위
- `Print Time`: 예상 출력 시간

## 현재 제한사항

- 현재 슬라이스 경로는 mesh와 수평 plane의 교차 segment를 기반으로 생성됩니다.
- contour 연결과 폐곡선 재구성은 아직 완성 단계가 아닙니다.
- travel path 최적화는 기본 수준입니다.
- 생성된 G-code는 초기 프로토타입용이므로 실제 장비에 사용하기 전에 반드시 검토해야 합니다.
- 콘크리트 pump timing과 장비별 명령어는 사용하는 프린터에 맞게 조정해야 합니다.

## 추천 사용 순서

1. 로컬 서버를 실행합니다.
2. 모델 파일을 업로드합니다.
3. Z-up 뷰포트에서 모델 방향을 확인합니다.
4. bead width와 bead height를 설정합니다.
5. 레이어를 수동으로 확인하거나 애니메이션으로 재생합니다.
6. `All Beads`를 켜서 전체 toolpath를 확인합니다.
7. `Printer Profile` 값을 조정합니다.
8. `G-code 미리보기`로 생성 결과를 확인합니다.
9. `G-code 다운로드`로 파일을 저장합니다.
10. 실제 프린터에 보내기 전에 G-code를 별도로 검증합니다.
