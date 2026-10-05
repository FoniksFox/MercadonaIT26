import { Component, input } from '@angular/core';

/** Plain table: the first column is text, the rest are right-aligned figures. */
@Component({
  selector: 'app-data-table',
  host: { class: 'block' },
  template: `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-line text-left text-ink-2">
          @for (column of columns(); track column; let first = $first) {
            <th scope="col" class="px-2 py-2 font-medium" [class.text-right]="!first">
              {{ column }}
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row[0]) {
          <tr class="border-b border-line last:border-0">
            @for (cell of row; track $index; let first = $first) {
              @if (first) {
                <th scope="row" class="px-2 py-2 text-left font-normal">{{ cell }}</th>
              } @else {
                <td class="px-2 py-2 text-right tabular-nums">{{ cell }}</td>
              }
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class DataTable {
  readonly columns = input.required<readonly string[]>();
  readonly rows = input.required<readonly (readonly string[])[]>();
}
