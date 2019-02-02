
class RowTracker:

    def __init__(self):
        self._removed_rows = []
        self.state_id = 0

    @property
    def removed_row_ranges(self):
        return self._removed_rows

    @removed_row_ranges.setter
    def removed_row_ranges(self, ranges):
        self._removed_rows = ranges

    @property
    def is_edited(self):
        return len(self._removed_rows) > 0

    def log_rows_added(index, count):
        changed = False
        for removed_range in self._removed_rows:
            if index < removed_range['index']:
                removed_range['index'] += count
                changed = True
            else:
                break

        if changed:
            self.state_id += 1

    def log_rows_removed(self, start, end):
        print('AA')
        if len(self._removed_rows) == 0:
            self._removed_rows.append({ 'index': start, 'count': end - start + 1 })
        else:
            consume_start = -1
            consume_end = -1
            insert_index = -1
            new_range = None
            for index in range(0, len(self._removed_rows)):
                removed_range = self._removed_rows[index]
                if start > removed_range['index']:
                    continue

                if new_range is None and end + 1 < removed_range['index']:
                    self._removed_rows.insert(index, { 'index': start, 'count': end - start + 1 })
                    for i in range(index + 1, len(self._removed_rows)):
                        self._removed_rows[i]['index'] -= end - start + 1
                    break
                elif removed_range['index'] >= start and removed_range['index'] <= end + 1:
                    if new_range is None:
                        insert_index = index
                        new_range = removed_range
                        new_range['index'] = start
                        new_range['count'] += end - start + 1
                    else:
                        if consume_start == -1:
                            consume_start = index
                        consume_end = index
                        new_range['count'] += removed_range['count']

            if consume_start != -1:
                del self._removed_rows[consume_start:(consume_end + 1)]

        self.state_id += 1

        print('BB')
