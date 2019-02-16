
class RowTracker:

    def __init__(self):
        self._removed_rows = []
        self._added_rows = []
        self.state_id = 0
        self._removed_row_count = -1
        self._added_row_count = -1

    def clear(self):
        self._removed_rows = []
        self._added_rows = []
        self._removed_row_count = -1
        self._added_row_count = -1
        self.state_id += 1

    @property
    def removed_row_ranges(self):
        return self._removed_rows

    @removed_row_ranges.setter
    def removed_row_ranges(self, ranges):
        self._removed_rows = ranges
        self._removed_row_count = -1

    @property
    def added_row_ranges(self):
        return self._added_rows

    @added_row_ranges.setter
    def added_row_ranges(self, ranges):
        self._added_rows = ranges
        self._added_row_count = -1

    @property
    def total_removed_row_count(self):
        if self._removed_row_count == -1:
            self._removed_row_count = 0
            for range in self._removed_rows:
                self._removed_row_count += range['count']

        return self._removed_row_count

    @property
    def total_added_row_count(self):
        if self._added_row_count == -1:
            self._added_row_count = 0
            for range in self._added_rows:
                self._added_row_count += range['end'] - range['start'] + 1

        return self._added_row_count

    @property
    def is_edited(self):
        return len(self._removed_rows) > 0 or len(self._added_rows) > 0

    def _add_weak_rows(self, start, end):
        if len(self._added_rows) == 0:
            self._added_rows.append({ 'start': start, 'end': end })
            return

        insert_at = -1
        consume_start = -1
        consume_end = -1
        count = end - start + 1
        for i, range in enumerate(self._added_rows):
            if start <= range['start']:
                range['start'] += count
                range['end'] += count

            if end + 1 == range['start']:
                if consume_start == -1:
                    consume_start = i
                    insert_at = i
                consume_end = i
                end = range['end']
            elif start - 1 == range['end']:
                if consume_start == -1:
                    consume_start = i
                    insert_at = i
                consume_end = i
                start = range['start']
            elif end + 1 < range['start']:
                if insert_at == -1:
                    insert_at = i

        if consume_start != -1:
            del self._added_rows[consume_start:(consume_end + 1)]

        if insert_at != -1:
            self._added_rows.insert(insert_at, { 'start': start, 'end': end })
        else:
            self._added_rows.append({ 'start': start, 'end': end })

    def _remove_solid_rows(self, start, end):
        if len(self._removed_rows) == 0:
            self._removed_rows.append({ 'index': start, 'count': end - start + 1 })
        else:
            consume_start = -1
            consume_end = -1
            added = False
            new_range = None
            for index in range(0, len(self._removed_rows)):
                removed_range = self._removed_rows[index]
                if start > removed_range['index']:
                    continue

                if new_range is None and end + 1 < removed_range['index']:
                    self._removed_rows.insert(index, { 'index': start, 'count': end - start + 1 })
                    for i in range(index + 1, len(self._removed_rows)):
                        self._removed_rows[i]['index'] -= end - start + 1
                    added = True
                    break
                elif start <= removed_range['index'] and end >= removed_range['index'] - 1:
                    added = True
                    if new_range is None:
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

            if added is False:
                self._removed_rows.append( { 'index': start, 'count': end - start + 1 })

    def _remove_weak_rows(self, start, end):
        consume_start = -1
        consume_end = -1
        count = end - start + 1
        last_range = None
        for i, range in enumerate(self._added_rows):
            if start <= range['start'] and end >= range['end']:
                if consume_start == -1:
                    consume_start = i
                consume_end = i
            elif start <= range['start'] and end < range['end'] and end >= range['start']:
                range['start'] = end + 1 - count
                range['end'] -= count
            elif start >= range['start'] and start <= range['end'] and end > range['end']:
                range['end'] = start - 1
            elif start < range['start'] and end < range['start']:
                range['start'] -= count
                range['end'] -= count
            elif start > range['start'] and end <= range['end']:
                range['end'] -= count

            if last_range is not None:
                if last_range['end'] == range['start'] - 1:
                    last_range['end'] = range['end']
                    if consume_start == -1:
                        consume_start = i
                    consume_end = i
                else:
                    last_range = range
            else:
                last_range = range

        if consume_start != -1:
            del self._added_rows[consume_start:(consume_end + 1)]

    def _determine_range_types(self, start, end):
        weak_ranges = []
        solid_ranges = []
        for added_range in self._added_rows:
            if start >= added_range['start'] and end <= added_range['end']:
                weak_ranges.append({ 'start': start, 'end': end } )
                return { 'solid': solid_ranges, 'weak': weak_ranges }
            elif start < added_range['start'] and end < added_range['start']:
                solid_ranges.append({ 'start': start, 'end': end })
                return { 'solid': solid_ranges, 'weak': weak_ranges }
            elif start < added_range['start'] and end <= added_range['end']:
                solid_ranges.append({ 'start': start, 'end': added_range['start'] - 1 })
                weak_ranges.append({ 'start': added_range['start'], 'end': end })
                return { 'solid': solid_ranges, 'weak': weak_ranges }
            elif start < added_range['start'] and end > added_range['end']:
                solid_ranges.append({ 'start': start, 'end': added_range['start'] - 1 })
                weak_ranges.append({ 'start': added_range['start'], 'end': added_range['end'] })
                start = added_range['end'] + 1
            elif start >= added_range['start'] and start <= added_range['end'] and end > added_range['end']:
                weak_ranges.append({ 'start': start, 'end': added_range['end'] })
                start = added_range['end'] + 1

        if start <= end:
            solid_ranges.append({ 'start': start, 'end': end })

        return { 'solid': solid_ranges, 'weak': weak_ranges }

    def log_rows_added(self, index, count):
        self.state_id += 1
        self._added_row_count = -1

        self._add_weak_rows(index, index + count - 1)

        for removed_range in self._removed_rows:
            if index < removed_range['index']:
                removed_range['index'] += count
            else:
                break

    def log_rows_removed(self, start, end):
        ranges = self._determine_range_types(start, end)

        self._remove_weak_rows(start, end)

        for i in range(len(ranges['weak']) - 1, -1, -1):
            weak_range = ranges['weak'][i]
            weak_count = weak_range['end'] - weak_range['start'] + 1
            for removed_range in self._removed_rows:
                if weak_range['start'] < removed_range['index']:
                    removed_range['index'] -= weak_count
            for solid_range in ranges['solid']:
                if weak_range['start'] < solid_range['start']:
                    solid_range['start'] -= weak_count
                    solid_range['end'] -= weak_count

        for i in range(len(ranges['solid']) - 1, -1, -1):
            solid_range = ranges['solid'][i]
            self._removed_row_count = -1
            self._remove_solid_rows(solid_range['start'], solid_range['end'])

        self._added_row_count = -1

        self.state_id += 1
