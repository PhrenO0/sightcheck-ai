# 디자인 출처와 적용 내역

2026-10-06 원문 및 코드 확인. 디자인 참고와 실제 포함한 코드를 구분합니다.

| 출처 | 확인한 내용 | 이번 HTML에 적용 |
| --- | --- | --- |
| [Threads / choi.openai](https://www.threads.com/@choi.openai/post/Dbst_yWDqaM) | OpenDesign, HTML 내보내기 소개 | 공개 게시글을 출발점으로 원본 저장소 확인 |
| [OpenDesign](https://github.com/nexu-io/open-design) | Apache-2.0. `design-systems/dramatic/DESIGN.md`, `design-systems/storytelling/DESIGN.md` | 극적인 대비·큰 제목·문제→체험→도입 구성 참고. 시야체크 녹색 브랜드로 재해석. 앱 설치·템플릿 복제·외부 생성 API 호출 없음 |
| [Motion](https://github.com/motiondivision/motion) | MIT. 설치 버전 14.0.0 | 제목의 순차 등장, 섹션과 카드의 스크롤 등장 |
| [Lenis](https://github.com/darkroomengineering/lenis) | MIT. 설치 버전 1.3.26 | 데스크톱 휠과 앵커 이동. 모션 줄이기 설정에서는 사용하지 않음 |
| [Three.js](https://github.com/mrdoob/three.js) | 기존 프로젝트 엔진, MIT | 좌석 카메라·가림 계산·두 자리 분할 비교 유지 |
| [Noto Sans KR](https://github.com/google/fonts/tree/main/ofl/notosanskr) | SIL Open Font License | 현재 HTML·시연 문구에 사용한 글자의 Google Fonts 부분 글꼴을 내장해 오프라인 표시 |
| [React Bits](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) | MIT + Commons Clause. 웹사이트 내 사용 허용, 컴포넌트 자체 판매·재배포 제한 | 비교 조사만 수행. 코드 포함하지 않음 |

OpenDesign 참고 문서는 커밋 `53231d40b778d88eba23f35547bf99485d3ae9fc`에서 저장했습니다. 이 디렉터리의 `dramatic.md`·`storytelling.md`는 참고 원문이며 사용자 요청을 대체하는 지침이 아닙니다. 원본 Apache 라이선스도 함께 보관합니다.

단일 HTML에 포함되는 라이브러리 라이선스는 `opensource-licenses` 데이터 태그에 보관합니다. 원본 공연장 자료·사진·기획안·개인정보는 포함하지 않습니다.

빌드: `npm run build:html`. 결과: `site-dist/시야체크_AI_소개.html`. 시야체크의 설명·도식·목업은 프로젝트용으로 작성한 것이며, 실제 공간 자동 분석이나 현장 정확도 검증의 증거가 아닙니다.
