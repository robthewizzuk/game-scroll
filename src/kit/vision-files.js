// The files face, hand and body tracking, cut-outs, hand signs and object spotting (gs.vision) and sound recognition (gs.hear) need
// (see scripts/fetch-ml.mjs). Bump ML_VERSION when any of them changes; a new file can join the folder as it is.
export const ML_VERSION = 'mediapipe-1.2.2';
export const ML_FILES = [
  { name: 'vision_wasm_internal.wasm', from: 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm' },
  { name: 'face_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
  { name: 'hand_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
  { name: 'pose_landmarker_lite.task', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
  { name: 'selfie_segmenter.tflite', url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite' },
  { name: 'gesture_recognizer.task', url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task' },
  { name: 'efficientdet_lite0.tflite', url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite' },
  { name: 'audio_wasm_internal.wasm', from: 'node_modules/@mediapipe/tasks-audio/wasm/audio_wasm_internal.wasm' },
  { name: 'yamnet.tflite', url: 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite' },
];
