# 빌라관리소 PWA

강북구 빌라관리사무소 민원 접수·관리용 웹앱(PWA). 순수 HTML/CSS/JavaScript +
Firebase(Firestore, Authentication, Storage) 로 구성되어 있으며 별도 빌드 과정이나
서버 프레임워크가 없습니다.

## 구성 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 화면, 스타일, 데이터, Firebase 연결, 업무 로직 전체 (지도·로고 이미지 포함) |
| `sw.js` | 서비스워커 — 우리 사이트 정적 파일만 캐시, API 요청은 캐시하지 않음 |
| `manifest.json` | PWA 설치 설정 |
| `icon-192.png`, `icon-512.png` | 앱 아이콘 |

## 실행 방법

빌드 과정이 없습니다. `index.html`을 정적 파일 호스팅(GitHub Pages 등)에
그대로 올리면 됩니다. 로컬에서 열어볼 때는 `python3 -m http.server` 같은
간단한 정적 서버로 열어야 합니다(파일을 그냥 더블클릭해서 열면 일부 기능이
브라우저 보안 정책으로 제한될 수 있습니다).

## 꼭 해야 하는 콘솔 설정

### 1) Firestore 규칙

Firebase 콘솔 → Firestore Database → 규칙에서 아래 내용으로 교체합니다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function managerZone() {
      return get(/databases/$(database)/documents/managers/$(request.auth.uid)).data.zone;
    }
    function isZoneManager(zone) {
      return request.auth != null
        && exists(/databases/$(database)/documents/managers/$(request.auth.uid))
        && managerZone() == zone;
    }

    match /managers/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
    }

    match /complaints/{complaintId} {
      allow get: if true;
      allow list: if isZoneManager(resource.data.zone);
      allow create: if
        request.resource.data.title is string && request.resource.data.title.size() <= 100 &&
        request.resource.data.content is string && request.resource.data.content.size() <= 2000 &&
        request.resource.data.category in ['청소','안전','주차','시설유지','생활편의'] &&
        request.resource.data.status == '접수';
      allow update: if isZoneManager(resource.data.zone)
        || (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','statusHistory'])
            && request.resource.data.status == '취소');
      allow delete: if isZoneManager(resource.data.zone);
    }

    match /activity/{activityId} {
      allow get, list: if isZoneManager(resource.data.zone);
      allow create: if isZoneManager(request.resource.data.zone);
      allow update, delete: if isZoneManager(resource.data.zone);
    }
  }
}
```

### 2) Storage 규칙

Firebase 콘솔 → Storage → 규칙.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /complaints/{code}/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 5 * 1024 * 1024
        && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### 3) 매니저 계정 — 담당 구역 지정

매니저 계정마다 Firestore에 `managers/{uid}` 문서를 만들고 `zone` 필드에
담당 구역명(예: `번1동`)을 넣어야 로그인 후 화면이 뜹니다. 문서가 없으면
로그인은 되지만 곧바로 "담당 구역이 설정되어 있지 않습니다"라는 안내와
함께 로그아웃됩니다.

### 4) 필요한 색인(index)

`complaints`와 `activity` 컬렉션 모두 `zone`(등호) + 정렬 필드(`createdAt`
또는 `timestamp`, 내림차순) 조합의 복합 색인이 필요합니다. 콘솔 콘솔 창에
색인 생성 링크가 뜨면 그걸 눌러 만들면 됩니다(1회, 수 분 소요).

## 알려진 한계 (이번 작업에서 고치지 못한 것)

아래 항목은 서버 코드(Cloud Functions 등, Firebase 유료 Blaze 요금제 필요)
없이는 근본적으로 해결되지 않는 항목입니다. 정직하게 남겨둡니다.

- **접수번호+PIN 조회**: PIN이 맞는지 확인하기 전에 문서 전체가 브라우저로
  전달됩니다. Firestore 보안 규칙은 문서 단위로만 허용/거부할 수 있어서,
  "같은 문서 안의 PIN 필드만 비교 후 나머지를 보여준다"는 서버 검증을 별도
  함수 없이는 구현할 수 없습니다. 6자리 코드 공간(32^6 ≈ 10억)이 커서
  무작위 추측은 사실상 불가능하지만, 코드를 이미 아는 사람이 PIN 확인을
  우회하는 것 자체는 막지 못합니다.
- **취소 요청의 서버 측 최종 검증**: PIN 일치는 클라이언트에서만 확인하고,
  Firestore 규칙은 "status 필드를 '취소'로만 바꾸는 요청"만 허용합니다.
  PIN을 몰라도 이 요청 형태 자체는 막을 수 없습니다.
- **완전한 동시성 제어**: 접수번호 중복은 저장 전 조회로 줄였지만
  트랜잭션 기반 원자적 보장은 아닙니다. 상태 변경도 마찬가지로 두 매니저가
  동시에 바꾸면 나중 쓰기가 이깁니다.
- **진짜 멱등성**: 제출 버튼 중복 클릭은 막았지만, 네트워크 재시도까지
  포함한 서버 단 중복 방지는 아닙니다.
- **사진 접근 통제**: Storage로 옮겨서 Firestore 문서 크기·목록 조회
  부담은 줄였지만, `getDownloadURL()`로 발급되는 링크 자체는 토큰을 포함해
  누구나 열 수 있는 구조입니다. 완전히 막으려면 서명된 URL을 매번 서버에서
  발급해야 합니다.
- **사업구역 정밀 경계 판정**: 주소 검색은 "가장 가까운 관리소"를 거리로
  추천할 뿐, 실제 사업 대상 여부(구역 경계 안쪽인지)는 판정하지 않습니다.
  실제 경계 GIS 데이터가 있어야 정확해집니다.
- **접근성(스크린리더·키보드 전용 탐색)**: 기본적인 label 연결 정도만
  되어 있고, 전체 화면의 키보드 전용 탐색·스크린리더 검증은 하지 못했습니다.
- **자동 테스트**: 별도 테스트 스위트는 없습니다. 이 프로젝트는 번들러나
  패키지 매니저를 쓰지 않아 lockfile도 없습니다.

## 이번에 실제로 고친 것

- XSS: 동/호수·답변 등 이스케이프 누락 수정, 속성값 전용 이스케이프 함수 추가
- 서비스워커가 API 요청까지 캐시하려던 문제 → 우리 사이트 정적 파일만 캐시
- 카테고리/사진 변경 시 작성 중이던 제목·내용·PIN이 사라지던 문제 → 임시저장 상태로 보존
- 접수번호 중복 방지 (저장 전 존재 여부 확인 후 재시도)
- 상태 변경 이력(`statusHistory`) 기록
- 개인정보 동의 없이 이름·전화번호가 첨부되던 문제 수정
- "오늘 처리완료" 실제 날짜 기준 집계로 수정
- 매니저 목록 무제한 로딩 → 500/300건 제한 + 구역별 쿼리
- **매니저 권한을 담당 구역으로 서버(Firestore 규칙) 단에서 실제로 제한**
- 사진을 Firestore 문서가 아닌 Firebase Storage에 저장 (문서 용량·조회 부담 감소)
- 접수/업무기록 버튼 중복 클릭 방지
- localStorage 파싱 오류 방어, 중복 구독 방지, 삭제된 문서 화면에서 제거
- 주소 검색 부분 실패 시 다음 시도에서 재시도하도록 수정
- 매니저 답변을 명시적 저장 버튼이 있는 여러 줄 입력으로 변경
- 종결(처리완료/반려/취소)된 민원은 상태를 다시 못 바꾸게 배지로 고정
- 미사용 함수(`latestOf`, `statusCardHtml`) 정리
