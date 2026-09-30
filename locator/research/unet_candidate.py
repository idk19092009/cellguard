"""Small 2D U-Net candidate for expert tumour masks on single CT images."""
from __future__ import annotations

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


class ConvBlock(nn.Sequential):
    def __init__(self, input_channels: int, output_channels: int):
        super().__init__(
            nn.Conv2d(input_channels, output_channels, 3, padding=1, bias=False),
            nn.GroupNorm(4, output_channels), nn.SiLU(inplace=True),
            nn.Conv2d(output_channels, output_channels, 3, padding=1, bias=False),
            nn.GroupNorm(4, output_channels), nn.SiLU(inplace=True),
        )


class TumourUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder1 = ConvBlock(1, 8)
        self.encoder2 = ConvBlock(8, 16)
        self.encoder3 = ConvBlock(16, 32)
        self.encoder4 = ConvBlock(32, 64)
        self.bottleneck = ConvBlock(64, 96)
        self.decoder4 = ConvBlock(96 + 64, 64)
        self.decoder3 = ConvBlock(64 + 32, 32)
        self.decoder2 = ConvBlock(32 + 16, 16)
        self.decoder1 = ConvBlock(16 + 8, 8)
        self.output = nn.Conv2d(8, 1, 1)

    def forward(self, image: torch.Tensor) -> torch.Tensor:
        a = self.encoder1(image)
        b = self.encoder2(F.max_pool2d(a, 2))
        c = self.encoder3(F.max_pool2d(b, 2))
        d = self.encoder4(F.max_pool2d(c, 2))
        x = self.bottleneck(F.max_pool2d(d, 2))
        for skip, decoder in ((d, self.decoder4), (c, self.decoder3),
                              (b, self.decoder2), (a, self.decoder1)):
            x = F.interpolate(x, size=skip.shape[-2:], mode="bilinear", align_corners=False)
            x = decoder(torch.cat((x, skip), dim=1))
        return self.output(x)


def read_pair(image_path: str, mask_path: str, size: int = 256) -> tuple[np.ndarray, np.ndarray]:
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if image is None or mask is None or image.shape != mask.shape:
        raise ValueError(f"Missing or mismatched image and mask: {image_path}")
    image = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA)
    mask = cv2.resize(mask, (size, size), interpolation=cv2.INTER_NEAREST)
    return image, (mask > 0).astype(np.uint8)


def augmented(image: np.ndarray, mask: np.ndarray, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    height, width = image.shape
    if rng.random() < .5:
        image, mask = cv2.flip(image, 1), cv2.flip(mask, 1)
    angle = float(rng.uniform(-6, 6))
    scale = float(rng.uniform(.92, 1.08))
    transform = cv2.getRotationMatrix2D((width / 2, height / 2), angle, scale)
    transform[:, 2] += rng.uniform(-5, 5, size=2)
    image = cv2.warpAffine(image, transform, (width, height), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    mask = cv2.warpAffine(mask, transform, (width, height), flags=cv2.INTER_NEAREST,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    image = np.clip(image.astype(np.float32) * rng.uniform(.9, 1.1)
                    + rng.uniform(-8, 8), 0, 255).astype(np.uint8)
    return image, mask
