
class CellTracker:

    def __init__(self):
        self._edited_cell_ranges = []
        self.state_id = 0
        self._total_edited = -1

    @property
    def total_edited_count(self):
        if self._total_edited == -1:
            self._total_edited = 0
            for range in self._edited_cell_ranges:
                self._total_edited += range['end'] - range['start'] + 1

        return self._total_edited

    @property
    def edited_cell_ranges(self):
        return self._edited_cell_ranges

    @edited_cell_ranges.setter
    def edited_cell_ranges(self, ranges):
        self._edited_cell_ranges = ranges
        self._total_edited = -1

    @property
    def is_edited(self):
        return len(self._edited_cell_ranges) > 0

    def clear(self):
        del self._edited_cell_ranges[:]
        self._total_edited = -1
        self.state_id += 1

    def set_cells_as_edited(self, start, end):
        if len(self._edited_cell_ranges) == 0:
            self._edited_cell_ranges.append({ 'start': start, 'end': end })
            self._total_edited = -1
            self.state_id += 1
            return

        insert_at = -1
        consume_start = -1
        consume_end = -1
        modified_range = None
        changed = True
        for index, range in enumerate(self._edited_cell_ranges):
            if start < range['start'] and end > range['end']:
                if consume_start == -1:
                    consume_start = index
                consume_end = index
            elif modified_range is not None and modified_range['end'] >= range['start'] - 1:
                consume_start = index
                consume_end = index
                if range['end'] > modified_range['end']:
                    modified_range['end'] = range['end']
            elif modified_range is None:
                if end < range['start'] - 1:
                    insert_at = index
                    break
                elif start >= range['start'] and end <= range['end']:
                    modified_range = range
                    changed = False
                    break
                elif start < range['start'] and end >= range['start'] - 1:
                    range['start'] = start
                    modified_range = range
                    break
                elif start <= range['end'] + 1 and end > range['end']:
                    range['end'] = end
                    modified_range = range

        if consume_start != -1:
            del self._edited_cell_ranges[consume_start:(consume_end + 1)]
            if consume_start < insert_at:
                insert_at -= consume_end - consume_start + 1

        if modified_range is None:
            if insert_at == -1:
                self._edited_cell_ranges.append({ 'start': start, 'end': end })
            else:
                self._edited_cell_ranges.insert(insert_at, { 'start': start, 'end': end })

        self._total_edited = -1
        if changed:
            self.state_id += 1

    def remove_rows(self, start, end):
        self.state_id += 1
        self._total_edited = -1

        consume_start = -1
        consume_end = -1
        count = end - start + 1
        last_range = None
        for i, range in enumerate(self._edited_cell_ranges):
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
            del self._edited_cell_ranges[consume_start:(consume_end + 1)]

    def insert_rows(self, start, end):
        self.state_id += 1
        self._total_edited = -1
        count = end - start + 1
        for edited_range in self._edited_cell_ranges:
            if start <= edited_range['start']:
                edited_range['start'] += count
                edited_range['end'] += count
            elif start <= edited_range['end']:
                edited_range['end'] += count
        self.set_cells_as_edited(start, end)
