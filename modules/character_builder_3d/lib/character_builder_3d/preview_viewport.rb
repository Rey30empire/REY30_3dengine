# frozen_string_literal: true

module CharacterBuilder3D
  # Wraps preview camera and drag zone behavior for the host engine.
  class PreviewViewport
    attr_reader :handle

    def initialize(engine_adapter, options = {})
      @engine = engine_adapter
      @handle = @engine.create_preview_viewport(options)
    end

    def show_base_character(node_handle)
      @engine.add_node_to_viewport(@handle, node_handle)
      focus_on(node_handle)
      node_handle
    end

    def remove_base_character(node_handle)
      return if node_handle.nil?

      @engine.remove_node_from_viewport(@handle, node_handle)
    end

    def detect_drop_zone(pointer_payload)
      ::CharacterBuilder3D.normalize_category(@engine.detect_drop_zone(@handle, pointer_payload))
    end

    def highlight_zone(zone_name)
      @engine.highlight_drop_zone(@handle, ::CharacterBuilder3D.normalize_category(zone_name))
    end

    def clear_highlight
      @engine.clear_drop_zone_highlight(@handle)
    end

    def rotate(delta_yaw:, delta_pitch:)
      @engine.orbit_camera(@handle, delta_yaw: delta_yaw, delta_pitch: delta_pitch)
    end

    def zoom(delta:)
      @engine.zoom_camera(@handle, delta: delta)
    end

    def focus_on(node_handle)
      @engine.focus_camera_on_node(@handle, node_handle)
    end

    def destroy
      @engine.destroy_preview_viewport(@handle)
    end
  end
end
