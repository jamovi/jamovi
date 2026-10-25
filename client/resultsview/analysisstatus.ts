'use strict';

// kept apart from ./create, which imports every element type -- the elements
// all need this at runtime, and importing it from there would be circular
export enum AnalysisStatus {
    ANALYSIS_NONE = 0,
    ANALYSIS_INITED = 1,
    ANALYSIS_RUNNING = 2,
    ANALYSIS_COMPLETE = 3,
    ANALYSIS_ERROR = 4,
    ANALYSIS_RENDERING = 5
}
