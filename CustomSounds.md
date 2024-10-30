# Creating Custom Keyboard Sounds Guide

This guide will walk you through the process of creating and adding custom keyboard sounds to the project.

## Prerequisites

- Audio recording equipment (preferably a condenser microphone)
- Audio editing software (e.g., Audacity or Adobe Audition)
- FFmpeg for audio file processing
- Audio files in .wav format for initial recording
- Basic understanding of audio editing software

## Step 1: Recording Your Sounds

1. **Choose Your Sound Style**
   - Decide on your desired sound type:
     - Mechanical keyboard clicks
     - Soft keystrokes
     - Musical notes
     - Custom sound effects

2. **Recording Setup**
   - Use a condenser microphone for best quality
   - Record in a quiet environment
   - Maintain consistent recording distance and levels

3. **Record Individual Sounds**
   - Record separate sounds for:
     - Alphabetical keys
     - Spacebar
     - Enter key
     - Backspace
     - Other special keys

## Step 2: Audio Processing

1. **Basic Audio Editing**
   - Trim silence from start and end of recordings
   - Normalize audio levels for consistency
   - Remove any background noise

2. **Optional Enhancements**
   - Apply equalization (EQ)
   - Add subtle reverb if desired
   - Adjust audio compression

3. **Export Settings**
   - Sample rate: 44.1kHz
   - Bit depth: 16-bit
   - Format: .wav (for processing) or .ogg (final format)
   - Keep file sizes under 1MB for optimal performance

## Step 3: Creating the Sound Pack

1. **Combine Sounds (if required)**
   - Create a filelist.txt containing your sound files:

   ```bash
   file 'custom_sounds/a.wav'
   file 'custom_sounds/b.wav'
   file 'custom_sounds/c.wav'
   ```

   - Use FFmpeg to combine files:

   ```bash
   ffmpeg -f concat -safe 0 -i filelist.txt -c:a libvorbis sound.ogg
   ```

2. **Configure Sound Mappings**
   - Create config.json for key mappings:

   ```json
   {
     "defines": {
       "KeyA": [0, 150],
       "KeyB": [150, 120],
       "Space": [270, 180],
       "Enter": [450, 200]
       // etc. etc.
     },
     "name": "Custom Sound Pack",
     "key_define_type": "single",
     "sound": "sound.ogg"
   }
   ```

## Step 4: Integration

1. **File Organization**
   - Create a new directory for your sound pack in:
     `/Users/{your_username}/Library/Application Support/xyz.waveapps.keyecho/sounds/`
   - Use lowercase letters and underscores for directory and filenames
   - Example structure:

     ```bash
     /Users/{your_username}/Library/Application Support/xyz.waveapps.keyecho/sounds/your_soundpack_name/
     ├── sound.ogg
     └── config.json
     ```

2. **Sound Pack Configuration**
   - Ensure your config.json is properly formatted
   - Place it alongside your sound.ogg file in your sound pack directory
   - Example:

     ```json
     {
       "name": "Your Sound Pack Name",
       "key_define_type": "single",
       "sound": "sound.ogg",
       "defines": {
         // your key mappings
       }
     }
     ```

3. **Update System Configuration**
   - The application will automatically detect new sound packs in the sounds directory
   - Restart the application if necessary to detect new sound packs

## Testing and Quality Control

1. **Sound Testing**
   - Test each key sound individually
   - Verify consistent volume levels
   - Check for audio artifacts
   - Test across different devices and browsers

2. **Performance Checks**
   - Monitor memory usage
   - Check loading times
   - Verify browser compatibility

## Troubleshooting

If your sounds aren't working:

- Verify file paths and permissions
- Check audio file format compatibility
- Confirm sound registration in config files
- Review browser console for errors
- Validate JSON syntax in configuration files

## Best Practices

- Maintain consistent volume levels across all sounds
- Keep backup copies of original recordings
- Use version control for configuration files
- Document any special processing or effects used
- Test thoroughly before deployment
