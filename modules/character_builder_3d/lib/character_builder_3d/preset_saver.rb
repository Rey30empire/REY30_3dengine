# frozen_string_literal: true

require 'fileutils'
require 'json'

module CharacterBuilder3D
  # Saves and restores builder state as JSON presets.
  class PresetSaver
    def save(path, state)
      FileUtils.mkdir_p(File.dirname(path))
      File.write(path, JSON.pretty_generate(state.to_h))
      path
    end

    def load(path)
      CharacterState.from_h(JSON.parse(File.read(path)))
    end

    class << self
      def save(path, state)
        new.save(path, state)
      end

      def load(path)
        new.load(path)
      end
    end
  end
end
