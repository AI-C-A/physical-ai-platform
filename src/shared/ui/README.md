# Shared UI

재사용 UI는 컴포넌트별 디렉터리와 Public API를 가진다.

```text
shared/ui/<component>/
├─ <Component>.tsx
└─ index.ts
```

업무 코드는 `@/shared/ui/<component>`만 import한다. Radix, shadcn 패턴, Recharts, Lucide와 스타일 조립 도구는 `shared/ui` 내부에서만 사용한다. 실제 화면에서 필요한 컴포넌트만 추가하며 루트 배럴 `shared/ui/index.ts`는 만들지 않는다.
