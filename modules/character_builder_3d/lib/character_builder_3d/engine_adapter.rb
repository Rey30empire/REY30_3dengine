# frozen_string_literal: true

module CharacterBuilder3D
  # Abstract bridge to the real engine.
  # Map these methods to the host engine instead of adding hidden logic here.
  class EngineAdapter
    # On the TS side this usually maps to src/engine/rendering/ModelLoader.ts.
    def load_model(_path)
      raise NotImplementedError, "#{self.class} must implement #load_model"
    end

    # Create a preview surface or viewport handle.
    def create_preview_viewport(_options = {})
      raise NotImplementedError, "#{self.class} must implement #create_preview_viewport"
    end

    # Destroy the preview surface when the builder is closed.
    def destroy_preview_viewport(_viewport_handle)
      raise NotImplementedError, "#{self.class} must implement #destroy_preview_viewport"
    end

    # Add a node to the preview scene.
    def add_node_to_viewport(_viewport_handle, _node_handle)
      raise NotImplementedError, "#{self.class} must implement #add_node_to_viewport"
    end

    # Remove a node from the preview scene.
    def remove_node_from_viewport(_viewport_handle, _node_handle)
      raise NotImplementedError, "#{self.class} must implement #remove_node_from_viewport"
    end

    # Attach a child node to a named character socket.
    def attach_node_to_socket(_base_node_handle, _child_node_handle, _socket_name)
      raise NotImplementedError, "#{self.class} must implement #attach_node_to_socket"
    end

    # Detach a node before removal or replacement.
    def detach_node(_node_handle)
      raise NotImplementedError, "#{self.class} must implement #detach_node"
    end

    # Release a node from engine memory.
    def unload_node(_node_handle)
      raise NotImplementedError, "#{self.class} must implement #unload_node"
    end

    # Read the skeleton identifier from the loaded base body if the engine exposes it.
    # In this repo that concept lines up with src/engine/animation/Avatar.ts.
    def extract_skeleton_id(_node_handle)
      raise NotImplementedError, "#{self.class} must implement #extract_skeleton_id"
    end

    # Resolve the category zone under the cursor during drag-and-drop.
    def detect_drop_zone(_viewport_handle, _pointer_payload)
      raise NotImplementedError, "#{self.class} must implement #detect_drop_zone"
    end

    # Optional helper to guide the user while dragging.
    def highlight_drop_zone(_viewport_handle, _zone_name)
      raise NotImplementedError, "#{self.class} must implement #highlight_drop_zone"
    end

    # Clear any active zone highlight.
    def clear_drop_zone_highlight(_viewport_handle)
      raise NotImplementedError, "#{self.class} must implement #clear_drop_zone_highlight"
    end

    # Drive the preview camera orbit.
    def orbit_camera(_viewport_handle, delta_yaw:, delta_pitch:)
      raise NotImplementedError, "#{self.class} must implement #orbit_camera"
    end

    # Drive the preview camera zoom.
    def zoom_camera(_viewport_handle, delta:)
      raise NotImplementedError, "#{self.class} must implement #zoom_camera"
    end

    # Focus the preview camera on the assembled character.
    def focus_camera_on_node(_viewport_handle, _node_handle)
      raise NotImplementedError, "#{self.class} must implement #focus_camera_on_node"
    end

    # Render or fetch a thumbnail for a part.
    # In this repo the concept lines up with src/engine/editor/visualThumbnails.tsx.
    def render_thumbnail(part)
      part.thumbnail
    end

    # Apply material and color variants after a part is attached.
    def apply_material_variant(_node_handle, part:, material_variant_id: nil, color_variant_id: nil)
      raise NotImplementedError, "#{self.class} must implement #apply_material_variant"
    end

    # Optional hook for forwarding structured errors to the host.
    def report_error(_report_hash)
      nil
    end
  end
end
