# frozen_string_literal: true

module CharacterBuilder3D
  # Coordinates pointer input with zone detection and builder updates.
  class DragDropController
    def initialize(builder:, preview_viewport:)
      @builder = builder
      @preview_viewport = preview_viewport
      @active_part_id = nil
    end

    def begin_drag(part_id)
      @active_part_id = part_id.to_s
      part = @builder.library.find_by_id(@active_part_id)
      @preview_viewport.highlight_zone(part.category) if part
      part
    end

    def hover(pointer_payload)
      return nil if @active_part_id.nil?

      zone = @preview_viewport.detect_drop_zone(pointer_payload)
      if ::CharacterBuilder3D.valid_category?(zone)
        @preview_viewport.highlight_zone(zone)
      else
        @preview_viewport.clear_highlight
      end
      zone
    end

    def drop(part_id: @active_part_id, pointer_payload: nil, target_zone: nil, material_variant_id: nil, color_variant_id: nil)
      resolved_part_id = part_id.to_s
      resolved_zone = target_zone || (pointer_payload && hover(pointer_payload))

      @preview_viewport.clear_highlight
      @active_part_id = nil

      unless ::CharacterBuilder3D.valid_category?(resolved_zone)
        raise InvalidCategoryError.new(resolved_zone)
      end

      @builder.apply_part_to_zone(
        resolved_part_id,
        resolved_zone,
        material_variant_id: material_variant_id,
        color_variant_id: color_variant_id
      )
    end

    def cancel_drag
      @active_part_id = nil
      @preview_viewport.clear_highlight
      nil
    end
  end
end
