'use client';

import { Button } from './button';
export function Pagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange(page: number): void }) { return <nav aria-label="Pagination" className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <Button key={number} variant={number === page ? 'primary' : 'ghost'} aria-label={`Page ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => onPageChange(number)}>{number}</Button>)}<Button variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</Button></nav>; }
