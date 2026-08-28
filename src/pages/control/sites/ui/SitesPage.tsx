import { Link } from 'react-router-dom';

import { monitoringSites } from '@/entities/site';
import { PageHeader } from '@/shared/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

function getSiteMonitoringPath(siteId: string): string {
  const params = new URLSearchParams({ siteId });
  return `/control/monitoring?${params.toString()}`;
}

export function SitesPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        actions={
          <p className="text-sm text-neutral-500">
            등록 사이트 {monitoringSites.length}개
          </p>
        }
        description="모니터링 사이트와 사이트별 지도 설정을 확인합니다."
        title="사이트 관리"
      />
      <Table aria-label="사이트 목록">
        <TableHeader>
          <TableRow>
            <TableHead>사이트</TableHead>
            <TableHead>환경</TableHead>
            <TableHead>지도 설정</TableHead>
            <TableHead>작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {monitoringSites.map((site) => (
            <TableRow key={site.id}>
              <TableCell>
                <strong className="block font-semibold text-neutral-950">
                  {site.displayName}
                </strong>
                <span className="block text-xs text-neutral-500">
                  {site.id}
                </span>
              </TableCell>
              <TableCell>
                {site.environment === 'indoor' ? '실내' : '실외'}
              </TableCell>
              <TableCell>
                {site.environment === 'indoor' ? (
                  <>
                    <span className="block">3D 모델</span>
                    <span className="block max-w-md truncate text-xs text-neutral-500">
                      {site.mapUrl}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block">지도 중심 좌표</span>
                    <span className="block text-xs text-neutral-500">
                      {site.mapCenter.latitude}, {site.mapCenter.longitude}
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell>
                <Link
                  aria-label={`${site.displayName} 모니터링 열기`}
                  className="font-semibold underline"
                  to={getSiteMonitoringPath(site.id)}
                >
                  모니터링
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
