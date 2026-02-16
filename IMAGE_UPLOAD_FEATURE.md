# Image Upload Feature - Implementation Summary

## Overview
Added image upload functionality to the AI Chat panel, allowing users to upload images along with their text prompts.

## Features Implemented

### 1. Image Upload Button
- Added a camera icon (📷) button next to the model selector
- Clicking the button opens a file picker for image selection
- Accepts all image formats (image/*)

### 2. Image Preview
- Shows a preview of the selected image before sending
- Preview displays with max dimensions (200x150px)
- Includes a remove button (✕) to clear the selection
- Preview appears above the text input field

### 3. WebSocket Message Format

**Case 1: Text only (no image)**
```json
{
  "message": "user's text prompt",
  "uid": "user_id",
  "model_type": "openai" or "gemini",
  "type": "user_message"
}
```

**Case 2: Image only (no text)**
```json
{
  "message": "",
  "uid": "user_id",
  "model_type": "openai" or "gemini",
  "type": "image",
  "image": "base64_encoded_image_data",
  "image_type": "image/png"
}
```

**Case 3: Both image and text**
```json
{
  "message": "user's text prompt",
  "uid": "user_id",
  "model_type": "openai" or "gemini",
  "type": "both",
  "image": "base64_encoded_image_data",
  "image_type": "image/png"
}
```

### 4. User Experience
- User clicks the camera button to select an image
- Image preview appears with a remove option
- User can type a prompt (optional)
- Clicking send or pressing Enter sends both the text and image
- The image preview is automatically removed after sending
- User message shows "📷" indicator when an image is included

## Technical Details

### New Properties
- `imageUploadButton`: HTMLButtonElement - The upload button
- `imageInput`: HTMLInputElement - Hidden file input element
- `selectedImage`: File | null - Currently selected image file
- `imagePreviewContainer`: HTMLDivElement | null - Preview container element

### New Methods
- `handleImageSelect()`: Handles file selection from input
- `showImagePreview()`: Creates and displays image preview
- `removeImagePreview()`: Removes preview and clears selection
- `convertImageToBase64()`: Converts image file to base64 string

### Modified Methods
- `handleSendMessage()`: Now checks for image and updates display message
- `sendWebSocketMessage()`: Now async, includes image data in payload

### CSS Classes Added
- `.imageUploadButton`: Styles for the upload button
- `.imagePreview`: Container for image preview
- `.previewImage`: Styles for the preview image
- `.removeImageButton`: Styles for the remove button

## Usage
1. Click the 📷 button in the chat input area
2. Select an image from your device
3. (Optional) Type a text prompt
4. Press Enter or click the send button
5. The message with image is sent to the backend with `Type: "image"`

## Backend Integration
The backend should handle three types of messages:
- `type: "user_message"` - Text only
- `type: "image"` - Image only (no text prompt)
- `type: "both"` - Both image and text prompt

The image data is sent as base64 in the `image` field, with the MIME type in `image_type`.
